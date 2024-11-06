const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LIST } = require("../constant");
const { PHASE_LABEL, instruction_32_emotion } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const { minmaxScaling } = require('../utils');

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GENERAL_SPEAKING_RULES = `
- Don't include double quotes \" at the start and the end of the response.
- Don't include any "tip:", "question:" etc and do not use hashtags. 
- Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>? )
`

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "event": "",
            "location": "",
            "people": "",
            "emotions": null,
            "time_of_day": "",
            "skip": false,
            "rationale": ''
        },
        next_phase: PHASE_LABEL.BEGINNING
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether user mentioned location and people that are involed in the key episode or not.
- Use JSON format with the following properties:
 ## emotions
 Find emotions in this list: ${EMOTION_LIST}. 
 Please do not provide any other labels outside of this list.
 If user express emotions out of emotion list, find and replace with the most similar one in emotion list. 
 Array starts with the strongest and listing them in descending order.
 Return 2 or 1 strongest emotions in the array.
 ## event: the key event that causes user's emotion.
 ## location: where did user usually have that emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 ## people: who did cause those emotions (e.g. alone, friend family). Only extract text written by user, do not predict.
 ## time_of_day: what time of day did event happen (e.g. morning, noon, night). Only extract text written by user, do not predict. Return only one word.
 ## skip: If user don't want to answer your questions, return true. Otherwise, return false.
 ## rationale: Describe your rationale on how properties emotions were derived. The emotions you put in analysis are included in emotion list or not and why you choose those emotions.
    {
        "summary": {
            "event": string | null,
            "location": string | null,
            "people": string | null,
            "emotions": [string] | null,
            "time_of_day": string | null,
            "skip": boolean,
            "rationale": string,
        }
    }`
    console.log("checkCriteriaExplorePhase", instruction)

    const _res = await generateAnalysis(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        if (res.summary.event && res.summary.location && res.summary.people && res.summary.time_of_day) {
            if (res.summary.emotions) {
                response.next_phase = PHASE_LABEL.FULLFILL
            } else {
                response.next_phase = PHASE_LABEL.MISSING_EMOTION
            }
        }
        else if (res.summary.emotions && !(res.summary.event || res.summary.location || res.summary.people || res.summary.time_of_day)) {
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

    console.log("checkCriteriaExplorePhase", response)
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
    - Summary: ${JSON.stringify(summary)}
    ${!summary.event ? (
            `- Ask user what happend to them.`
        ) : !summary.people ? (
            `- Ask user who was involved in the event and contribute to user's emotion.`
        ) : !summary.location ? (
            `- Ask user where did the event occurred.`
        ) : !summary.time_of_day ? (
            `- Guess the key event happened at what time of day (e.g morning, noon, evening, night) and ask user if it is right.`
        ) : ""}
    - Response should be less than 50 words.
    - Ask only one question.
    ${GENERAL_SPEAKING_RULES}
`
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
emotion list: ${EMOTION_LIST}.
Return the response in JSON format, structured as follows:
### Analysis
Check each value in the input array. If the value in the input list is not included in the emotion list, try to replace it with the most similar meaning in the emotion list. If it is the same, remain it. The output array have to have the same lenght with input array.
Check again and make sure that analysis only includes values in emotion list. 
### rationale
reason how you generate analysis properties. The emotions you put in analysis are included in emotion list or not. 
### content
Explain to user why you think user have emotions that listed in the analysis property. Your response to user should be as second person pronoun "YOU". Your response should be shorter than 50 words.

Response must be JSON format:
{
    "analysis": [string],
    "rationale": string,
    "content": string
}
    `
    console.log("confirmEmotions", task_instruction)
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
        response.content = res.content
        console.log("confirmEmotions", res)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const retrieveRelevantDiaryByContext = async (userid, diaryid, diary, dialog) => {
    console.log("retrieveRelevantDiaryByContext")
    const response = {
        error: "",
        phase: PHASE_LABEL.FULLFILL,
        content: "",
        analysis: null,
        rationale: ""
    }

    const existingCategories = {}
    try {
        const location = await Statistic.distinct( "subcategory", { category: "location" } )
        const people = await Statistic.distinct( "subcategory", { category: "people" } )
        const activity = await Statistic.distinct( "subcategory", { category: "activity" } )

        existingCategories["location"] = location
        existingCategories["people"] = people
        existingCategories["activity"] = activity
    } catch(err) {
        console.error("retrieveRelevantDiaryByContext", "existingCategories", err)
    }

    try {
        const context = await categorizeContext(diary, dialog, existingCategories)

        diaries = await Diary.find({ userid: userid, _id : { $ne: diaryid } });
        console.log("diaryid", diaryid)
        if (!diaries) {
            return response
        } 

        const similarityScores = []
        diaries.forEach(diary => {
            let similarityScore = 0 
            if (diary.location === context.location) similarityScore += 1;
            if (diary.people === context.people) similarityScore += 1;
            if (diary.activity === context.activity) similarityScore += 1;  
            if (diary.time_of_day === context.time_of_day) similarityScore += 1;   
            similarityScores.push(similarityScore)         
        })

        const similarityScoresScale = minmaxScaling(similarityScores)
        const sortedDiaries = []
        diaries.forEach((diary, index) => {
            sortedDiaries.push({
                diary_id: diary._id,
                score: similarityScoresScale[index] + diary.context_retention
            })       
        })
        sortedDiaries.sort((a,b) => b.score - a.score)
        console.log("sortedDiaries", sortedDiaries)
        const topThree = diaries.filter(e => e._id === sortedDiaries[0].diary_id || e._id === sortedDiaries[1].diary_id || e._id === sortedDiaries[2].diary_id)
        console.log("topThree", topThree)
    } catch (err) {
        err && console.error(err);
        response.error = err
        return response
    }
    return response
}

const generateFeedbackPhase = async (diary, dialog) => {
    const instruction = `You are a psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary.
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user are satisfied with the analysis, say thank and tell them to click Finish button on the top screen to finish section.
    - If user give feedback to you, try to make analysis again based on diary and their feedback.
    - Use JSON format with the following properties:
    - Emotion list: ${EMOTION_LIST}.
    ## analysis
    Based on diary, detect which emotions of emotion list in the diary entry according to their intensity, starting with the strongest and listing them in descending order. Make sure to consider only emotions in emotion list. Do not repeat emotion. Format the analysis as follows: [first intense emotion, second most intense]. length of array must be less than 4. If user was satisfied with the previous analysis, return null.
    Only use emotions list. If user told you emotion label out of provided emotion list, find the most similar emotion in emotion list and explain to user in the content property.
    ## content
    Your response to user as second person pronoun "you". 
    Don't use third person pronoun. 
    Never return array of emotions in this properties.
    Your response should be shorter than 50 words.
    ## rationale
    reason how you generate analysis properties. The emotions you put in analysis are included in emotion list or not.
    
    Return the response in JSON format:
        {
            "analysis": [string],
            "content": string,
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
        console.log("generateFeedbackPhase", instruction)
        console.log("generateFeedbackPhase", res)
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

const categorizeContext = async (diary, dialog, existingCategory) => {
    const response = {
        activity: "",
        location: "",
        people: "",
        time_of_day: "",
    }
    const { activity, location, people } = existingCategory
    const instruction = `Based on diary and dialog, classify contextual information into category.
Use JSON format with the following properties:
- activity: detect key activity in the diary and return the category that it belong to. Consider these category: ${activity || ""}, studying, research, resting, meeting, eating, socializing, leisure activity, exercise, moving. If it doesn't belong to any of those, generate suitable category label. Don't return "other".
- location: detect where did user usually have that emotions and return the category that it belong to. Consider these category: ${location || ""}, home, classroom, library, restaurant, office, laboratory. If it doesn't belong to any of those, generate suitable category label. Don't return "other".
- people: detect who did cause those emotions and return the category that it belong to. Consider these category: ${people || ""}, alone, family, boyfriend, girlfriend, roommate, friend, colleague, professor. If it doesn't belong to any of those, generate suitable category label. Don't return "other".
- time_of_day: what time of day did event happen. Only use one of the following: morning, noon, afternoon, evening, night, all_day. Return only one word.
- rationale: Describe your rationale on how properties were derived.
    {
        "activity": string | null,
        "location": string | null,
        "people": string | null,
        "time_of_day": string | null,
        "rationale": string,
    }`

    const _res = await generateAnalysis(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        response.activity = res.activity
        response.location = res.location
        response.people = res.people
        response.time_of_day = res.time_of_day
    } catch(error) {
        console.error("categorizeContext", error)
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
    confirmEmotions,
    generateAnalysis,
    retrieveRelevantDiaryByContext,
    categorizeContext
}

