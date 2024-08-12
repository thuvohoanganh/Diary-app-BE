const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL, EMOTION_LIST } = require("../constant");
const { PHASE_LABEL } = require('../constant')

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "key_episode": "",
            "user_emotion": "", 
            "location": "",
            "people": "",
            "move_to_next": false,
            "rationale": ''
        },
        next_phase: PHASE_LABEL.EXPLORE
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether it is reasonable to move on to the next conversation phase or not.
- Move to the next phase only when the user shared a key episode and you can figure out theri emotions about it.
- Use JSON format with the following properties:
  (1) key_episode: a key episode that the user described.
  (2) user_emotion: the emotion of the user caused by the key episode. Make sure the emotion is connected to (1)
  (3) location: where did event happen (e.g. home, office). Only extract text writtent by user, do not predict.
  (4) people: who were involved in the event and contribute to user's emotion (e.g. alone, friend). Only extract text writtent by user, do not predict.
  (5) move_to_next: When (1) and (2) and (3) and (4) are not null or user don't want to answer your questions, you can go to the next step.
  (6) rationale: Describe your rationale on how the above properties were derived.
  (7) empathized: you have showed your empathy to user or not. yes is true, no is false
    {
        "summary": {
            "key_episode": string | null,
            "user_emotion": string | null, 
            "location": string | null,
            "people": string | null,
            "move_to_next": boolean,
            "rationale": string,
            "empathized": boolean
        }
    }`

    const _res = await checkCriteria(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        if (res.summary.move_to_next) {
            response.next_phase = PHASE_LABEL.EXPLAIN
        }
        response.summary = res.summary
        console.log("checkCriteria", response)
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

const checkCriteriaFeedbackPhase = async (diary, dialog) => {
    return {
        error: "",
        summary: {
            location: "",
            people: "",
        },
        next_phase: ""
    }
}

const generateResponseExplorePhase = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.EXPLORE,
        content: "",
    }

    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event, ask them to elaborate more about their emotions or missing contextual information that contribute to user's emotion. 
    - Follow up what user mentioned in the diary.
    ${!summary.empathized? (
    `- Empathize the user's emotion by restating how they felt.
    - Separate the empathy and the questions with line break.`
    ) : ""}
    - Choose only 1 missing information (null) and ask 1 question.
    
Dialog summary: 
key_episode: ${summary.key_episode},
user_emotion:  ${summary.user_emotion}, 
people:  ${summary.people},
location: ${summary.location}
rationale: ${summary.rationale}
`
    const res = await generateResponse(diary, dialog, instruction)
    console.log("generateResponse", res)
    if (!res) {
        response.error = "ChatGPT failed"
        response.phase = PHASE_LABEL.EXPLORE
        return response
    }

    response.content = res
    return response
}

const generateExplanationPhase = async (diary, dialog) => {
    const instruction = `You are and psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary, tell the user how you feel about their emotions and reason why.
    Return response with JSON format with the following properties:
    (1) content: you should show empathy and tell user how you feel about their emotion and reason why.
    (2) analysis: assest user's emotions based on 6 basic emotions (${EMOTION_LIST}) from 0 to 5
    (3) rationale: Describe to user your rationale on how the "analysis" properties were derived.
    {
        "content": string,
        "analysis": {
            ${[EMOTION_LABEL.JOY]}: number,
            ${[EMOTION_LABEL.DISGUST]}: number,
            ${[EMOTION_LABEL.ANGRY]}: number,
            ${[EMOTION_LABEL.FEAR]}: number,
            ${[EMOTION_LABEL.SADNESS]}: number,
            ${[EMOTION_LABEL.SURPRISE]}: number,
        },
        "rationale": string
    } 
    `
    const response = {
        error: "",
        phase: PHASE_LABEL.EXPLAIN,
        content: "",
        analysis: null,
        rationale: ""
    }
    const _res =  await generateResponse(diary, dialog, instruction)

    try {
        const res = JSON.parse(_res)
        if (res.content && res.analysis) {
            response.content = res.content
            response.analysis = res.analysis
            response.rationale = res.rationale
        } else {
            throw("error: wrong response format function generateResponse")
        }
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }
    return response
}

const generateFeedbackPhase = async (diary, dialog) => {
    const instruction = `You are and psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary.
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user are satisfied with the analysis, say thank and goodbye to them.
    - If user give you feedback, acknowledge and tell them how you understand their feelings after feedback. Then ask them if they have other things to share.
    - If the user has nothing to share or byes, say thank and goodbye to them.
    - Use JSON format with the following properties:
    (1) content: your response to user
    (2) end: you say bye to user or not
        {
            "content": string,
            "end": boolean
        }
    `
    const response = {
        error: "",
        phase: PHASE_LABEL.FEEDBACK,
        content: "",
        end: false
    }
    const _res =  await generateResponse(diary, dialog, instruction)

    try {
        const res = JSON.parse(_res)
        if (res.content && res.analysis) {
            response.content = res.content
            response.end = res.end
        } else {
            throw("error: wrong response format function generateResponse")
        }
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }
    return response
}

const generateResponse = async (diary, dialog, instruction) => {
    let response = ""
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}`
        },
        ...dialog
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
        console.log(err)
        return ""
    }
    return response
}

const checkCriteria = async (diary, dialog, instruction) => {
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
        console.log(err)
        return ""
    }
    return response
}


module.exports = {
    checkCriteriaExplorePhase,
    checkCriteriaFeedbackPhase,
    generateResponseExplorePhase,
    generateExplanationPhase,
    generateFeedbackPhase
}
