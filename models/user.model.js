const mongoose = require('mongoose');
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  emailVerified: {
    type: Boolean,
    required: true,
    default: false
  },
  address: {
    type: String,
  },
  customStatus: {
    type: String,
    trim: true
  },
  didNut: {
    type: Boolean,
    required: true,
    default: false
  },
  nutDateAndTime: {
    type: String,
  },
  notificationSettings: {
    type: [mongoose.Schema.Types.Mixed],
    required: true,
    default: [{
      all: true
    }]
  },
  outgoingFriendRequests: {
    type: [mongoose.Schema.Types.ObjectId]
  },
  incomingFriendRequests: {
    type: [mongoose.Schema.Types.ObjectId]
  },
  friends: {
    type: [mongoose.Schema.Types.ObjectId]
  },
  emailVerificationHash: {
    type: String,
    required: true,
    default: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }
}, {
  timestamp: true
});

userSchema.plugin(passportLocalMongoose, { usernameField : 'email' });
const User = mongoose.model('User', userSchema);

module.exports = User;
