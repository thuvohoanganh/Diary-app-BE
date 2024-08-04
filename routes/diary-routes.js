const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const diaryController = require('../controllers/diary-controllers');
const { createDiary, retrieveDiary, getDiaries, updateDiary, deleteDiary } = diaryController;

router.post('/create',
    [
        check('userid')
            .not()
            .isEmpty(),
        check('timestamp')
            .not()
            .isEmpty(),
        check('content')
            .not()
            .isEmpty(),
        check('emotions')
            .isArray(),
        check('people')
            .isArray(),
        // check('dialog')
        //     .optional()
        //     .isObject(),
        check('images')
            .optional()
            .isArray()
    ],
    createDiary
);

router.get('/:uid/:pid', retrieveDiary);

router.get('/:uid', getDiaries);

router.patch('/:uid/:pid', 
    [
        check('emotions')
            .optional()
            .isArray(),
        check('people')
            .optional()
            .isArray(),
        // check('dialog')
        //     .optional()
        //     .isObject(),
        check('images')
            .optional()
            .isArray()
    ],
    updateDiary
);

router.delete('/:uid/:pid', deleteDiary)

module.exports = router;