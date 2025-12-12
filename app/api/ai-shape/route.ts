import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheaper alternative to gpt-4o
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that generates SVG path outlines for shapes that will be traced as bike routes on street networks.

CRITICAL REQUIREMENTS:
- Generate ONLY a single SVG <path> element with fill="none" stroke="black" stroke-width="2"
- Use coordinates in the range 0-100 for both x and y
- The path MUST contain AT LEAST 50-100 POINTS to allow accurate fitting to street networks
- Create a continuous outline path that traces the perimeter/outline of the shape
- Use ONLY L (line) commands - break curves into many small line segments
- Add many intermediate points along straight edges and curves
- DO NOT use Z (close path) - the path should be open
- Return ONLY the SVG path element with stroke styling, nothing else

IMPORTANT: More points = better street fitting. Distribute points evenly along the entire outline.

EXAMPLES:

House outline (with many points):
<path fill="none" stroke="black" stroke-width="2" d="M 20 80 L 20 75 L 20 70 L 20 65 L 20 60 L 20 55 L 20 50 L 25 45 L 30 40 L 35 35 L 40 30 L 45 25 L 50 20 L 55 25 L 60 30 L 65 35 L 70 40 L 75 45 L 80 50 L 80 55 L 80 60 L 80 65 L 80 70 L 80 75 L 80 80 L 75 80 L 70 80 L 65 80 L 60 80 L 60 75 L 60 70 L 60 65 L 60 60 L 65 60 L 70 60 L 70 65 L 70 70 L 70 75 L 70 80 L 65 80 L 60 80 L 55 80 L 50 80 L 45 80 L 40 80 L 40 75 L 40 70 L 40 65 L 40 60 L 35 80 L 30 80 L 25 80 L 20 80"/>

Star outline (with many points):
<path fill="none" stroke="black" stroke-width="2" d="M 50 10 L 52 15 L 54 20 L 56 25 L 58 30 L 60 33 L 65 34 L 70 35 L 75 35 L 80 35 L 85 36 L 90 36 L 93 37 L 95 38 L 92 42 L 88 46 L 84 50 L 80 54 L 76 56 L 74 58 L 75 62 L 76 66 L 77 70 L 78 75 L 78 80 L 79 85 L 79 90 L 78 92 L 75 90 L 72 87 L 68 84 L 64 80 L 60 76 L 56 73 L 52 71 L 50 70 L 48 71 L 44 73 L 40 76 L 36 80 L 32 84 L 28 87 L 25 90 L 22 92 L 21 90 L 21 85 L 22 80 L 22 75 L 23 70 L 24 66 L 25 62 L 26 58 L 24 56 L 20 54 L 16 50 L 12 46 L 8 42 L 5 38 L 7 37 L 10 36 L 15 36 L 20 35 L 25 35 L 30 35 L 35 34 L 40 33 L 42 30 L 44 25 L 46 20 L 48 15 L 50 10"/>

Think: Trace the outline of the shape with MANY small steps. More points = better fit to streets!`,
        },
        {
          role: 'user',
          content: `Generate an SVG path for: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const svgContent = completion.choices[0]?.message?.content?.trim()

    if (!svgContent) {
      return NextResponse.json(
        { error: 'Failed to generate shape' },
        { status: 500 }
      )
    }

    // Extract just the path element if AI included extra text
    const pathMatch = svgContent.match(/<path[^>]*d="([^"]+)"[^>]*\/>|<path[^>]*d='([^']+)'[^>]*\/>/i)

    if (!pathMatch) {
      return NextResponse.json(
        { error: 'Invalid SVG generated. Please try a different description.' },
        { status: 500 }
      )
    }

    // Return the full SVG path element
    return NextResponse.json({
      svg: pathMatch[0],
      rawResponse: svgContent
    })

  } catch (error) {
    console.error('AI shape generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate shape' },
      { status: 500 }
    )
  }
}
