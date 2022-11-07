import { OpenAIApi } from 'openai'
import * as yaml from 'yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Prompt } from './types.js'
import { promptSchema } from './type-validations.js'

const promptVariableRegex = /(?<!\\)<(\w+)>/g

export class Promptize {
    private readonly cachedPrompts: Record<string, Prompt> = {}

    constructor(private readonly openai: OpenAIApi, private readonly promptsDirectory: string) {}

    public async generate(promptId: string, variables: Record<string, any>): Promise<string[]> {
        const prompt = await this.getPrompt(promptId)

        const promptVariables = prompt.prompt.match(promptVariableRegex)
        let replacedPrompt = prompt.prompt
        if (promptVariables) {
            for (const variable of promptVariables) {
                const variableId = variable.replace(/<|>/g, '')
                if (!variables[variableId]) {
                    throw new Error(`Missing variable ${variable} in prompt ${promptId}`)
                }

                replacedPrompt = prompt.prompt.replace(variable, variables[variableId])
            }
        }

        const formattedPrompt = this.sanitize(replacedPrompt)
        const response = await this.openai.createCompletion({
            model: prompt.engine,
            prompt: formattedPrompt,
        })

        return response.data.choices
            .filter((choice) => choice?.text)
            .map((choice) => this.sanitize(choice.text as string))
    }

    public async getPrompt(promptId: string): Promise<Prompt> {
        if (this.cachedPrompts[promptId]) {
            return this.cachedPrompts[promptId]
        }

        let serializedPrompt: string
        try {
            serializedPrompt = await fs.promises.readFile(path.join(this.promptsDirectory, `${promptId}.yml`), 'utf8')
        } catch (error) {
            serializedPrompt = await fs.promises.readFile(path.join(this.promptsDirectory, `${promptId}.yaml`), 'utf-8')
        }
        const parsed = yaml.parse(serializedPrompt)

        const validatedPrompt = await promptSchema.parseAsync(parsed)

        this.cachedPrompts[promptId] = parsed
        return validatedPrompt
    }

    private sanitize(target: string): string {
        return target
            .replace(/\n+\s*/g, '\n')
            .replace(/ +/g, ' ')
            .trim()
    }
}
