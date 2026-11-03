'use strict';

const mongoose = require('mongoose');

const PollVoteSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  optionIndex: { type: Number, required: true, min: 0 },
  votedAt: { type: Date, default: Date.now },
}, { _id: false });

const ParentPollSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, maxlength: 240 },
  description: { type: String, default: '', trim: true, maxlength: 1200 },
  options: {
    type: [{ type: String, trim: true, maxlength: 80 }],
    validate: {
      validator: (items) => Array.isArray(items) && items.length >= 2 && items.length <= 6,
      message: 'A poll must contain between 2 and 6 options.',
    },
  },
  standard: { type: String, required: true, trim: true, default: 'all', maxlength: 80 },
  startsAt: { type: Date, default: Date.now, required: true },
  endsAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '', trim: true, maxlength: 120 },
  votes: { type: [PollVoteSchema], default: [] },
}, { timestamps: true });

ParentPollSchema.index({ isActive: 1, startsAt: 1, endsAt: 1, standard: 1 });

module.exports = mongoose.model('ParentPoll', ParentPollSchema);
