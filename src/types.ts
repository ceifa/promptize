export type Variable = {
    name: string
    type?: 'string' | 'number' | 'boolean'
    metadata?: Record<string, any>
}

export type Settings = {
    max_tokens?: number
    temperature?:  number
    frequency_penalty?: number
    presence_penalty?: number
    stop?: string[]
}

export type Prompt = {
    name: string
    description?: string
    tags?: string[]
    engine: string
    prompt: string
    vars: Record<string, Variable>
    settings: Settings
    metadata?: Record<string, any>
}
