const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LIST } = require("../constant");
const { PHASE_LABEL, instruction_32_emotion } = require('../constant')

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GENERAL_SPEAKING_RULES = `
- Do not include double quotes \" at the start and the end of the response.
- Do not include any "tip:", "question:" etc and do not use hashtags. 
`

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "event": "",
            "user_emotion": "",
            "location": "",
            "people": "",
            "emotions": null,
            "times_of_day": "",
            "skip": false,
            "rationale": ''
        },
        next_phase: PHASE_LABEL.BEGINNING
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether user mentioned location and people that are involed in the key episode or not.
- Use JSON format with the following properties:
 emotions: First, extract the emotions user expressed clearly in the diary. Only extract text written by user, do not predict. If no emotion was mentioned, return null and end. If you detect any emotions, try to convert to one of emotion in this list: ${EMOTION_LIST}). 
 event: the key event that causes user's emotion.
 location: where did user usually have that emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 people: who did cause those emotions (e.g. alone, friend family). Only extract text written by user, do not predict.
 times_of_day: what time of day did event happen (e.g. morning, noon, night). Only extract text written by user, do not predict. Return only one word.
 skip: If user don't want to answer your questions, return true. Otherwise, return false.
 rationale: Describe your rationale on how properties were derived.
    {
        "summary": {
            "event": string | null,
            "location": string | null,
            "people": string | null,
            "emotions": [string] | null,
            "times_of_day": string | null,
            "skip": boolean,
            "rationale": string,
        }
    }`

    const _res = await generateAnalysis(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        if (res.summary.event && res.summary.location && res.summary.people && res.summary.times_of_day) {
            if (res.summary.emotions) {
                response.next_phase = PHASE_LABEL.FULLFILL
            } else {
                response.next_phase = PHASE_LABEL.MISSING_EMOTION
            }
        }
        else if (res.summary.emotions && !(res.summary.event || res.summary.location || res.summary.people || res.summary.times_of_day)) {
            response.next_phase = PHASE_LABEL.MISSING_CONTEXT
        } else {
            response.next_phase = PHASE_LABEL.BEGINNING
        }
        // else if (res.summary.skip) {
        //     response.next_phase = PHASE_LABEL.DETECT
        // }
        response.summary = res.summary
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
            response.summary = null
            return response
        } else {
            response.error = "ChatGPT return wrong format"
            response.summary = null
        }
    }

    return response
}

const askMissingInfor = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.BEGINNING,
        content: "",
    }
    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event.
    - Follow up what user mentioned in the diary.
    ${JSON.stringify(summary)}
    ${!summary.event ? (
            `- Ask user what happend to them.`
        ) : !summary.people ? (
            `- Ask user who was involved in the event and contribute to user's emotion.`
        ) : !summary.location ? (
            `- Ask user where did the event occurred.`
        ) : !summary.times_of_day ? (
            `- Guess the key event happened at what time of day (e.g morning, noon, evening, night) and ask user.`
        ) : ""}
    - Response should be less than 50 words.
    - Ask only one question.
    ${GENERAL_SPEAKING_RULES}
`
console.log("instruction", instruction)

    const res = await generateResponse(diary, dialog, instruction)
    if (!res) {
        response.error = "ChatGPT failed"
        return response
    }

    response.content = res.replace(/^\"+|\"+$/gm, '')
    return response
}

const generateDetectEmotion = async (diary, dialog) => {

    const task_instruction = instruction_32_emotion

    const response = {
        error: "",
        phase: PHASE_LABEL.MISSING_EMOTION,
        content: "",
        analysis: null,
        rationale: ""
    }
    const _res = await generateResponse(diary, dialog, task_instruction)


    try {
        const res = JSON.parse(_res)
        if (res.content && res.analysis) {
            response.content = res.content.replace(/^\"+|\"+$/gm, '')
            response.analysis = res.analysis
        } else {
            throw ("error: wrong response format function generateResponse")
        }
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
        } else {
            console.error(_res)
            response.content = _res
        }
    }

    response.content = response.content.replace(/^\"+|\"+$/gm, '')

    console.log("Response: ", response);
    return response
}

const confirmEmotions = async (diary, summary) => {
    const task_instruction = ` 
    input array: ${JSON.stringify(summary.emotions)}
    Plutchik's emotion model: ${EMOTION_LIST}.
    input array are the emotions detected in the diary
Return the response in JSON format, structured as follows:
### Analysis
look at each value in the input array. If the value in the input list is not included in the Plutchik's emotion model, try to replace it with the most similar meaning in the Plutchik's emotion model. If it is the same, remain it. The output array have to have the same lenght with input array.
### rationale
reason how you generate content and analysis properties. Your response to user should be as second person pronoun "YOU". Your response should be shorter than 50 words.

Response must be JSON format:
{
    “analysis”: [string],
    “rationale”: string
}
    `

    const response = {
        error: "",
        phase: PHASE_LABEL.FULLFILL,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(diary, [], task_instruction)

    try {
        const res = JSON.parse(_res)
        response.analysis = res.analysis
        response.content = res.rationale
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const generateFeedbackPhase = async (diary, dialog) => {
    const instruction = `You are a psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary.
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user are satisfied with the analysis, say thank and tell them to click Finish button on the top screen to finish section.
    - If user give feedback to you, try to make analysis again based on diary and their feedback and 32 emotions of Plutchik's model (${EMOTION_LIST}). If they told you emotion label, try to convert their emotions to Plutchik’s Wheel of Emotions and explain to user in the content property.
    - Only use 32 emotions of Plutchik's model in analysis. 
    - Use JSON format with the following properties:
    (1) content: your response to user as second person pronoun "YOU". do not use third person pronoun. Never return array of emotions in this properties.
    (2) analysis: based on diary, detect which emotions of Plutchik's model in the diary entry according to their intensity, starting with the strongest and listing them in descending order. Make sure to consider only 32 emotions of Plutchik's model: ${EMOTION_LIST}. Do not repeat emotion. Format the analysis as follows: [first intense emotion, second most intense, third most intense]. If user was satisfied with the previous analysis, return null.
    (3) rationale: reason how you generate content and analysis properties. Your response to user should be as second person pronoun "YOU". Your response should be shorter than 50 words.
    Return the response in JSON format:
        {
            "content": string,
            "analysis": [string],
            "rationale": string
        }
    `
    const response = {
        error: "",
        phase: PHASE_LABEL.FEEDBACK,
        content: "",
        analysis: [],
        rationale: ""
    }
    const _res = await generateResponse(diary, dialog, instruction)

    try {
        const res = JSON.parse(_res)
        if (res.content) {
            response.content = res.content.replace(/^\"+|\"+$/gm, '')
            response.analysis = res.analysis
            response.rationale = res.rationale
        } else {
            response.content = _res
        }
    } catch {
        if (typeof _res === "string") {
            response.content = _res.replace(/^\"+|\"+$/gm, '')
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }
    return response
}

const generateResponse = async (diary, dialog, instruction) => {
    let response = ""
    const _dialog = dialog.map(e => ({
        ...e,
        content: JSON.stringify(e.content)
    }))
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}`
        },
        ..._dialog
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 0.5
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error(err)
        return ""
    }
    return response
}

const generateAnalysis = async (diary, dialog, instruction) => {
    let response = ""
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}
            Dialog: ${JSON.stringify(dialog)}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 0.1
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error(err)
        return ""
    }
    return response
}

const generateRationaleSummary = async (diary, dialog, initRationale) => {
    const instruction = `You are and psychologist. you are good at emotion awareness and you can understand where human emotion come from on user's diary. From the dialog, you assess user' emotions from 0 to 5. User gave you feedback about your analysis.
    - From the dialog, determine user agree or disagree with you analysis.
    - If user agree, return exactly your previous rationale. DO NOT include double quotes \" at the start and the end of the response.
    - If user disagree and give feedback, generate another rationale based on their feedback and your previous rationale. 
    ${GENERAL_SPEAKING_RULES}
    This is previous your rationale: ${initRationale}
    Response example: From your diary, there's a sense of tiredness which can be associated with a low level of sadness. There's also a hint of joy from spending time with a friend and visting the cathedral. There's no indication of disgust, anger, fear, or surprise in your writing.
    `
    let updatedRationale = await generateResponse(diary, dialog, instruction)
    updatedRationale = updatedRationale.replace(/^\"+|\"+$/gm, '')

    return updatedRationale
}

const consolidate = async (diary, dialog) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.BEGINNING,
        content: "",
    }
    const instruction = `
- Use JSON format with the following properties:
 emotions: First, extract the emotions user expressed clearly in the diary. Only extract text written by user, do not predict. If no emotion was mentioned, return null and end. If you detect any emotions, try to convert to one of emotion in this list: ${EMOTION_LIST}). 
 event: the key event that causes user's emotion.
 location: where did user usually have that emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 people: who did cause those emotions (e.g. alone, friend family). Only extract text written by user, do not predict.
 times_of_day: what time of day did event happen (e.g. morning, noon, night). Only extract text written by user, do not predict. Return only one word.
 skip: If user don't want to answer your questions, return true. Otherwise, return false.
 rationale: Describe your rationale on how properties were derived.
    {
        "summary": {
            "event": string | null,
            "location": string | null,
            "people": string | null,
            "emotions": [string] | null,
            "times_of_day": string | null,
            "skip": boolean,
            "rationale": string,
        }
    }`

const _res = await generateAnalysis(diary, dialog, instruction)
try {
    const res = JSON.parse(_res)
    
} catch {
    
}

    return response
}

module.exports = {
    checkCriteriaExplorePhase,
    askMissingInfor,
    generateDetectEmotion,
    generateFeedbackPhase,
    generateResponse,
    generateRationaleSummary,
    confirmEmotions
}

