import openai from 'openai'
import yaml from 'yaml'
import fs from 'node:fs'
import path from 'node:path'
import { Prompt } from './types'
import { promptSchema } from './type-validations'

const promptVariableRegex = /(?<!\\)<(\w+)>/g

export default class Promptize {
    private readonly cachedPrompts: Record<string, Prompt> = {}

    constructor(private readonly openai: openai.OpenAIApi, private readonly promptsDirectory: string) {}

    public async generate(
        openai: openai.OpenAIApi,
        promptId: string,
        variables: Record<string, any>,
    ): Promise<string[]> {
        const prompt = await this.loadPrompt(promptId)

        const promptVariables = prompt.prompt.match(promptVariableRegex)
        let replacedPrompt = prompt.prompt
        if (promptVariables) {
            for (const variable of promptVariables) {
                if (!variables[variable]) {
                    throw new Error(`Missing variable ${variable} in prompt ${promptId}`)
                }

                replacedPrompt = prompt.prompt.replace(variable, variables[variable])
            }
        }

        const formattedPrompt = this.sanitize(replacedPrompt)
        const response = await openai.createCompletion({
            model: prompt.engine,
            prompt: formattedPrompt,
        })

        return response.data.choices
            .filter((choice) => choice?.text)
            .map((choice) => this.sanitize(choice.text as string))
    }

    private sanitize(target: string): string {
        return target
            .replace(/\n+\s*/g, '\n')
            .replace(/ +/g, ' ')
            .trim()
    }

    private async loadPrompt(promptId: string): Promise<Prompt> {
        if (this.cachedPrompts[promptId]) {
            return this.cachedPrompts[promptId]
        }

        const prompt = await fs.promises.readFile(path.join(this.promptsDirectory, `${promptId}.yaml`), 'utf-8')
        const parsed = yaml.parse(prompt)

        const validatedPrompt = await promptSchema.parseAsync(parsed)

        this.cachedPrompts[promptId] = parsed
        return validatedPrompt
    }
}
