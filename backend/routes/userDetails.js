const express = require('express');
const User = require('../models/User');

const router = express.Router();

// // GET all User detail
router.get('/', async (req, res) => {
  try {
    //   const users = await User.find().select('-password'); // Exclude password from the result
    const users = await User.find(); // Exclude password from the result

    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// router.delete('/:id', async (req, res) => {
//     await PDF.findByIdAndDelete(req.params.id);
//     res.sendStatus(204);
// });

module.exports = router;