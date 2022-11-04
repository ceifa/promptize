export type Variable = {
    name: string
    example?: string
    max_length?: number
    type?: 'string' | 'number' | 'boolean'
}

export type Settings = {
    max_tokens: number
    temperature:  number
    frequency_penalty: number
    presence_penalty: number
}

export type Prompt = {
    name: string
    description?: string
    tags?: string[]
    engine: string
    prompt: string
    vars: Variable[]
}
