/**
 * Created by kinnimew on 26/4/16.
 */
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var request = require("request-promise-native");

const FB_MESSENGER_ENDPOINT = "https://graph.facebook.com/v2.10/me/messages";
const FB_PROFILE_ENDPOINT = "https://graph.facebook.com/v2.10/";
const FB_SETTINGS_ENDPOINT = "https://graph.facebook.com/v2.10/me/thread_settings";
const FB_MESSENGER_PROFILE_ENDPOINT = "https://graph.facebook.com/v2.10/me/messenger_profile";

const NOTIFICATION_TYPE = {
    REGULAR: "REGULAR",
    SILENT_PUSH: "SILENT_PUSH",
    NO_PUSH: "NO_PUSH"
};

function FBBotFramework(options) {

    if (!options || !options.page_token)
        throw new Error("Page Access Token missing. See FB documentation for details: https://developers.facebook.com/docs/messenger-platform/quickstart");
 
    this.page_token = options.page_token;
    this.verify_token = options.verify_token;
    this.commands = []; 
}

// Setup
util.inherits(FBBotFramework, EventEmitter);

FBBotFramework.NOTIFICATION_TYPE = NOTIFICATION_TYPE;

FBBotFramework.prototype.verify = function (req, res) {
    if (req.query['hub.verify_token'] === this.verify_token) {
        res.send(req.query['hub.challenge']);
    } else {
        res.status(500).send('Error, wrong validation token');
    }
};

// Send API, Details please visit https://developers.facebook.com/docs/messenger-platform/send-api-reference#request

FBBotFramework.prototype.send = function (recipient, messageData, notificationType) {
    notificationType = notificationType || NOTIFICATION_TYPE.REGULAR;

    var req = {
        url: FB_MESSENGER_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "POST",
        json: {
            recipient: {id: recipient},
            message: messageData,
            notification_type: notificationType
        }
    };

    return request(req); 
};


FBBotFramework.prototype.sendTextMessage = function (recipient, text, notificationType) {
    var messageData = {text: text};
    return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.sendAudioAttachment = function (recipient, audioUrl, notificationType) {
    var messageData = {
        attachment: {
            type: "audio",
            payload: {url: audioUrl}
        }
    };

   return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.sendVideoAttachment = function (recipient, videoUrl, notificationType) {
    var messageData = {
        attachment: {
            type: "file",
            payload: {url: videoUrl}
        }
    };

    return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.sendFileAttachment = function (recipient, fileUrl, notificationType) {
    var messageData = {
        attachment: {
            type: "video",
            payload: {url: fileUrl}
        }
    };

    return this.send(recipient, messageData, notificationType);
};

// TODO: Audio, Video and File Upload

FBBotFramework.prototype.sendImageMessage = function (recipient, imageUrl, notificationType) {
    var messageData = {
        attachment: {
            type: "image",
            payload: {url: imageUrl}
        }
    };

    return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.sendButtonMessage = function (recipient, text, buttons, notificationType) {

    var messageData = {
        attachment: {
            type: "template",
            payload: {
                template_type: "button",
                text: text,
                buttons: buttons
            }
        }
    };

   return this.send(recipient, messageData, notificationType);
};


// Limitation
// Title: 45 characters
// Subtitle: 80 characters
// Call-to-action title: 20 characters
// Call-to-action items: 3 buttons
// Bubbles per message (horizontal scroll): 10 elements

FBBotFramework.prototype.sendBubbleMessage = FBBotFramework.prototype.sendGenericMessage = function (recipient, elements, notificationType) {
    var messageData = {
        attachment: {
            type: "template",
            payload: {
                template_type: "generic",
                elements: elements
            }
        }
    };

    return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.sendReceiptMessage = function (recipient, receipt, notificationType) {

    if (!receipt.template_type) {
        receipt.template_type = "receipt";
    }

    var messageData = {
        "attachment": {
            "type": "template",
            "payload": receipt
        }
    };

    return this.send(recipient, messageData, notificationType);
};

FBBotFramework.prototype.getUserProfile = function (userId) {

    var req = {
        method: "GET",
        uri: FB_PROFILE_ENDPOINT + userId,
        qs: {
            fields: 'first_name,last_name,profile_pic,locale,timezone,gender',
            access_token: this.page_token
        },
        json: true
    };

    return request(req);
};

// Middleware
FBBotFramework.prototype.middleware = function () {

    var bot = this;

    return function (req, res) {
        if (req.method === 'GET') {
            return bot.verify(req, res);
        }

        if (req.method === 'POST') {

            // Read data from the request
            var data = '';
            req.setEncoding('utf8');
            req.on('data', function (chunk) {
                data += chunk;
            });

            req.on('end', function () {

                // Always return HTTP200 to Facebook's POST Request
                res.send({});

                var messageData = JSON.parse(data);
                var messagingEvent = messageData.entry[0].messaging;
                messagingEvent.forEach(function (event) {

                    // Extract senderID, i.e. recipient
                    var sender = event.sender.id;

                    // Trigger onEcho Listener
                    if (event.message && event.message.is_echo) {
                        return bot.emit('echo', event.recipient.id, event.message.text);
                    }

                    // Trigger quickyReply Listener
                    if (event.message && event.message.quick_reply) {
                        return bot.emit('quickreply', sender, event.message.quick_reply.payload);
                    }

                    // Trigger onMessage Listener
                    if (event.message && event.message.text) {
                        bot.emit('message', sender, event.message.text);
                    }

                    // Trigger onPostback Listener
                    if (event.postback && event.postback.payload) {
                        bot.emit('postback', sender, event.postback.payload, event.postback.referral);
                    }

                    // Trigger onAttachment Listener
                    if (event.message && event.message.attachments) {
                        bot.emit('attachment', sender, event.message.attachments);
                    }

                    if (event.referral) {
                        bot.emit('messagingReferral', sender, event.referral);
                    }

                });
            });

        }
    };
};


FBBotFramework.prototype.setGreetingText = function (text) {
    var req = {
        url: FB_SETTINGS_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "POST",
        json: {
            "setting_type": "greeting",
            "greeting": {
                "text": text
            }
        }
    };

    return request(req);
};

FBBotFramework.prototype.setGetStartedButton = function (payload) {
    var req = {
        url: FB_SETTINGS_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "POST",
        json: {
            "setting_type": "call_to_actions",
            "thread_state": "new_thread",
            "call_to_actions": [
                {
                    "payload": payload
                }
            ]
        }
    };

    return request(req);
};

FBBotFramework.prototype.setPersistentMenu = function (menuButtons) {
    var req = {
        url: FB_SETTINGS_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "POST",
        json: {
            "setting_type": "call_to_actions",
            "thread_state": "existing_thread",
            "call_to_actions": menuButtons
        }
    };

    return request(req);
};
// Nested Persistent Menu
FBBotFramework.prototype.setPersistentMenuX = function(persistent_menu) {
    var req = {
        url: FB_MESSENGER_PROFILE_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "POST",
        json: {
            "persistent_menu" : persistent_menu
        }
    };

    return request(req); 
}

FBBotFramework.prototype.deletePersistentMenu = function() {
    var req = {
        url: FB_MESSENGER_PROFILE_ENDPOINT,
        qs: {access_token: this.page_token},
        method: "DELETE",
        json: {
            "fields" : [
                'PERSISTENT_MENU'
            ]
        }
    };

    return request(req); 
}


FBBotFramework.prototype.sendQuickReplies = function (recipient, text, replies, notificationType) {
    var messageData = {
        text: text,
        quick_replies: replies
    };

    return this.send(recipient, messageData, notificationType);

};

FBBotFramework.prototype.sendLocationRequest = function (recipient, text, notificationType) {
    var messageData = {
        text: text,
        quick_replies: [{content_type: "location"}]
    };

    return this.send(recipient, messageData, notificationType);

};

FBBotFramework.prototype.sendListMessage = function (recipient, elements, notificationType) {

    var messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "list",
                "top_element_style": "compact",
                "elements": elements
            }
        }
    };

    return this.send(recipient, messageData, notificationType); 
};

FBBotFramework.prototype.whitelistDomains = function(domains) {
    var req = {
        url: FB_MESSENGER_PROFILE_ENDPOINT,
        qs: {
            access_token: this.page_token
        },
        method: "POST",
        json: {
            "whitelisted_domains": domains
        }
    };
 
    return request(req);
};

FBBotFramework.prototype.sendSenderAction = function(userId, action) {
    var req = {
        url: FB_MESSENGER_ENDPOINT,
        qs: {
            access_token: this.page_token
        },
        method: "POST",
        json: {
            recipient:{
          	    id: userId
            },
            sender_action: action
        }
    };

    return request(req);
}

FBBotFramework.prototype.typingOn = function(userId) {
    return this.sendSenderAction(userId, 'typing_on');
}

FBBotFramework.prototype.typingOff = function(userId) {
    return this.sendSenderAction(userId, 'typing_off');
}

FBBotFramework.prototype.markSeen = function(userId) {
    return this.sendSenderAction(userId, 'mark_seen');
}




module.exports = FBBotFramework;
