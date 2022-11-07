import { OpenAIApi } from 'openai'
import { Promptize } from '../dist/index.js'

const params = process.argv.slice(2)
const consumeOption = (option, single) => {
    const i = params.indexOf(option)
    if (i >= 0) {
        return params.splice(i, single ? 1 : 2).reverse()[0]
    }
}

const token = consumeOption('--token')
if (!token) {
    console.error('Missing --token')
    process.exit(1)
}

const openai = new OpenAIApi({
    accessToken: token,
})

const examplesDir = new URL('../examples', import.meta.url).pathname;
const promptize = new Promptize(openai, examplesDir)

const promptId = consumeOption('--prompt')
if (!promptId) {
    console.error('Missing --prompt')
    process.exit(1)
}

const prompt = await promptize.getPrompt(promptId)
const values = {}
for (const varId of Object.keys(prompt.vars)) {
    const value = consumeOption(`--v-${varId}`)
    if (!value) {
        console.error(`Missing --v-${varId}`)
        process.exit(1)
    }
    values[varId] = value
}

const result = await promptize.generate(promptId, values)
console.log(result)