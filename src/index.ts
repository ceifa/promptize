import { OpenAIApi } from 'openai'
import * as yaml from 'yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Prompt } from './types.js'
import { promptSchema } from './type-validations.js'

const promptVariableRegex = /(?<!\\)<([A-za-z-]+)>/g

export class Promptize {
    private readonly cachedPrompts: Record<string, Prompt> = {}
    private readonly promptsDirectory: string | undefined

    constructor(private readonly openai: OpenAIApi, promptsOrDirectory: string | Record<string, Prompt>) {
        if (typeof promptsOrDirectory === 'string') {
            this.promptsDirectory = promptsOrDirectory
        } else {
            this.cachedPrompts = promptsOrDirectory
        }
    }

    public async generate(
        promptId: string,
        variables: Record<string, any>,
        options: {
            quantity?: number
            user?: string
            moderate?: boolean
        },
    ): Promise<string[]> {
        const prompt = await this.getPrompt(promptId)

        const promptVariables = prompt.prompt.match(promptVariableRegex)
        let replacedPrompt = prompt.prompt
        if (promptVariables) {
            for (const variable of promptVariables) {
                const variableId = variable.replace(/<|>/g, '')
                if (!variables[variableId]) {
                    throw new Error(`Missing variable ${variable} in prompt ${promptId}`)
                }

                replacedPrompt = replacedPrompt.replaceAll(variable, variables[variableId])
            }
        }

        const formattedPrompt = this.sanitize(replacedPrompt)

        if (options?.moderate) {
            const moderation = await this.openai.createModeration({ input: formattedPrompt })
            const flagged = moderation.data.results[0].flagged
            if (flagged) {
                throw new Error(`Prompt ${promptId} was flagged by OpenAI's moderation system.`)
            }
        }

        if (prompt.engine.includes('gpt-3.5') || prompt.engine.includes('gpt-4')) {
            const response = await this.openai.createChatCompletion({
                model: prompt.engine,
                messages: [{ role: 'user', content: formattedPrompt }],
                max_tokens: prompt.settings.max_tokens,
                temperature: prompt.settings.temperature,
                frequency_penalty: prompt.settings.frequency_penalty,
                presence_penalty: prompt.settings.presence_penalty,
                stop: prompt.settings.stop,
                user: options?.user,
            })

            const content = response.data.choices?.[0]?.message?.content
            if (!content) {
                throw new Error(`Prompt ${promptId} returned no content`)
            }

            return [this.sanitize(content)]
        } else {
            const response = await this.openai.createCompletion({
                model: prompt.engine,
                prompt: formattedPrompt,
                max_tokens: prompt.settings.max_tokens,
                temperature: prompt.settings.temperature,
                frequency_penalty: prompt.settings.frequency_penalty,
                presence_penalty: prompt.settings.presence_penalty,
                n: options?.quantity,
                stop: prompt.settings.stop,
                user: options?.user,
            })

            return response.data.choices
                .filter((choice) => choice?.text)
                .map((choice) => this.sanitize(choice.text as string))
        }
    }

    public async getPrompt(promptId: string): Promise<Prompt> {
        if (this.cachedPrompts[promptId]) {
            return this.cachedPrompts[promptId]
        }

        if (this.promptsDirectory) {
            let serializedPrompt: string
            try {
                serializedPrompt = await fs.promises.readFile(
                    path.join(this.promptsDirectory, `${promptId}.yml`),
                    'utf8',
                )
            } catch (err) {
                serializedPrompt = await fs.promises.readFile(
                    path.join(this.promptsDirectory, `${promptId}.yaml`),
                    'utf-8',
                )
            }
            const parsed = yaml.parse(serializedPrompt)

            try {
                const validatedPrompt = await promptSchema.parseAsync(parsed)

                this.cachedPrompts[promptId] = parsed
                return validatedPrompt
            } catch (err) {
                throw new Error(`Prompt ${promptId} is invalid`, { cause: err })
            }
        }

        throw new Error(`Prompt ${promptId} not found`)
    }

    public async getPrompts(): Promise<Record<string, Prompt>> {
        if (this.promptsDirectory) {
            const files = await fs.promises.readdir(this.promptsDirectory)
            const prompts = await Promise.all(
                files.map(async (file) => {
                    const id = file.replace(/\.yml|\.yaml/g, '')
                    const prompt = await this.getPrompt(id)
                    return [id, prompt] as const
                }),
            )
            return Object.fromEntries(prompts)
        } else {
            return this.cachedPrompts
        }
    }

    private sanitize(target: string): string {
        return target
            .replace(/\n+\s*/g, '\n')
            .replace(/ +/g, ' ')
            .trim()
    }
}
