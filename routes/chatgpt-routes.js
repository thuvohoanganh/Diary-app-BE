const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { predictContextualInfor, chatbotConversation, generateImage, generateWeeklySummary } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotions-recognition', [
    check('user_id')
        .not()
        .isEmpty(),
    check('diary_id')
        .not()
        .isEmpty(),
], chatbotConversation);

router.post('/context-prediction', predictContextualInfor);

router.post('/image-generation', generateImage);

router.get('/weekly-summary/:uid', generateWeeklySummary)

module.exports = router;