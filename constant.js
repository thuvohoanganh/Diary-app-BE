const EMOTION_LABEL = {
    SERENITY: "calm",
    JOY: "joy",
    ECSTASY: "delight",
    ACCEPTANCE: "acceptance",
    TRUST: "trust",
    ADMIRATION: "admiration",
    APPREHENSION: "anxiety",
    FEAR: "fear",
    TERROR: "terror",
    DISTRACTION: "distraction",
    SURPRISE: "surprise",
    AMAZEMENT: "amazement",
    PENSIVENESS: "unhappyness",
    SADNESS: "sadness",
    GRIEF: "heartbroken",
    BOREDOM: "tiredness",
    DISGUST: "disgust",
    LOATHING: "horror",
    ANNOYANCE: "annoyance",
    ANGER: "anger",
    RAGE: "overwhelmedness",
    INTEREST: "interest",
    ANTICIPATION: "anticipation",
    VIGILANCE: "focus",
    // LOVE: "love",
    // SUBMISSION: "submission",
    // AWE: "shock",
    // DISAPPROVAL: "disapproval",
    // REMORSE: "guilt",
    // CONTEMPT: "contempt",
    // AGGRESSIVENESS: "aggressiveness",
    // OPTIMISM: "optimism"
};

const EMOTION_DIMENSION = {
    [EMOTION_LABEL.SERENITY]: 1,
    [EMOTION_LABEL.JOY]: 1,
    [EMOTION_LABEL.ECSTASY]: 1,
    [EMOTION_LABEL.ACCEPTANCE]: 2,
    [EMOTION_LABEL.ADMIRATION]: 2,
    [EMOTION_LABEL.TRUST]: 2,
    [EMOTION_LABEL.FEAR]: 3,
    [EMOTION_LABEL.APPREHENSION]: 3,
    [EMOTION_LABEL.TERROR]: 3,
    [EMOTION_LABEL.AMAZEMENT]: 4,
    [EMOTION_LABEL.SURPRISE]: 4,
    [EMOTION_LABEL.DISTRACTION]: 4,
    [EMOTION_LABEL.PENSIVENESS]: 5,
    [EMOTION_LABEL.SADNESS]: 5,
    [EMOTION_LABEL.GRIEF]: 5,
    [EMOTION_LABEL.BOREDOM]:6,
    [EMOTION_LABEL.DISGUST]: 6,
    [EMOTION_LABEL.LOATHING]: 6,
    [EMOTION_LABEL.ANNOYANCE]: 7,
    [EMOTION_LABEL.ANGER]: 7,
    [EMOTION_LABEL.RAGE]: 7,
    [EMOTION_LABEL.INTEREST]: 8,
    [EMOTION_LABEL.ANTICIPATION]: 8,
    [EMOTION_LABEL.VIGILANCE]: 8,
}

const PHASE_LABEL = {
    PHASE_1: "beginning",
    PHASE_2: "emotion_classify",
    PHASE_3: "revise_emotion_classify",
    PHASE_4: "reasoning",
    PHASE_5: "revise_reasoning",
    PHASE_6: "goodbye",
}

const GPT = {
    MODEL: "gpt-4o-2024-08-06"
}

module.exports = {
    EMOTION_LABEL,
    PHASE_LABEL,
    EMOTION_DIMENSION,
    GPT
}