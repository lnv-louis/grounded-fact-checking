import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to validate if a URL is reachable
async function validateUrl(url: string): Promise<boolean> {
  try {
    if (!url || url.trim() === '') return false;
    
    // Basic URL format validation
    const urlPattern = /^https?:\/\/.+\..+/;
    if (!urlPattern.test(url)) return false;
    
    // Try to fetch with HEAD request (faster than GET)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GroundedBot/1.0)'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Consider 200-399 as valid, and some 403s (some sites block HEAD requests)
    return response.status < 400 || response.status === 403;
  } catch (error) {
    // URL is invalid or unreachable
    return false;
  }
}

// Function to fetch and extract article content
async function fetchArticleContent(url: string): Promise<{ headline: string; content: string; fetchSuccess: boolean } | null> {
  try {
    console.log('Fetching article from:', url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('Failed to fetch article:', response.status);
      return { headline: '', content: '', fetchSuccess: false };
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return { headline: '', content: '', fetchSuccess: false };

    // Try to extract headline
    let headline = '';
    const h1 = doc.querySelector('h1');
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    const title = doc.querySelector('title');
    
    headline = h1?.textContent?.trim() || 
               ogTitle?.getAttribute('content') || 
               title?.textContent?.trim() || 
               '';

    // Try to extract main content
    let content = '';
    
    // Common article content selectors
    const articleSelectors = [
      'article',
      '[role="main"]',
      '.article-body',
      '.post-content',
      '.entry-content',
      'main'
    ];

    for (const selector of articleSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        // Remove scripts, styles, nav, header, footer
        const unwanted = element.querySelectorAll('script, style, nav, header, footer, .ad, .advertisement');
        unwanted.forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            parent.removeChild(el);
          }
        });
        
        content = element.textContent?.trim() || '';
        if (content.length > 200) break;
      }
    }

    // Fallback: get all paragraphs
    if (!content || content.length < 200) {
      const paragraphs = Array.from(doc.querySelectorAll('p'))
        .map(p => p.textContent?.trim() || '')
        .filter(text => text.length > 50);
      content = paragraphs.join('\n\n');
    }

    console.log(`Extracted - Headline: "${headline.substring(0, 100)}", Content length: ${content.length} chars`);
    
    return content.length > 100 ? { headline, content, fetchSuccess: true } : { headline, content: '', fetchSuccess: false };
  } catch (error) {
    console.error('Error fetching article:', error);
    return { headline: '', content: '', fetchSuccess: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

    if (!PERPLEXITY_API_KEY) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing query:', query);

    // Detect if input is a URL
    const isUrl = /^https?:\/\//i.test(query.trim());
    
    let articleData: { headline: string; content: string; fetchSuccess: boolean } | null = null;
    let actualContent = query;
    let extractionSuccess = false;
    
    // If it's a URL, fetch and extract the article content
    if (isUrl) {
      articleData = await fetchArticleContent(query);
      if (articleData && articleData.fetchSuccess && articleData.content) {
        actualContent = `Article URL: ${query}\n\nHeadline: ${articleData.headline}\n\nArticle Content:\n${articleData.content}`;
        extractionSuccess = true;
        console.log('Successfully extracted article content');
      } else {
        console.warn('Failed to extract article content, falling back to URL-only analysis');
        actualContent = query;
        extractionSuccess = false;
      }
    }
    
    // Pre-prompt to generate analysis criteria
    const prePrompt = `INPUT TYPE DETECTION:
${isUrl ? 
`The user has provided a URL: ${query}
${extractionSuccess ? 
  `I have successfully fetched and extracted the full article content including the headline and body text.
  CRITICAL: You MUST use the EXACT headline provided below. DO NOT create your own headline.
  CRITICAL: Analyze ONLY the claims made IN the article content itself, NOT claims about the news sources.
  CRITICAL: For ALL URLs you provide in sources, citations, and source chains:
  - ONLY include URLs that you have VERIFIED exist and are accessible
  - DO NOT make up or invent any URLs
  - DO NOT create plausible-looking URLs that might not exist
  - If you don't have a verified URL for a source, leave the url field EMPTY ("")
  - It is BETTER to have an empty URL than a fake/made-up URL
  - VERIFY: Does this URL actually exist before including it
  Example WRONG: "https://www.reformparty.uk/news" (made up)
  Example RIGHT: Leave url as "" if you can't verify it exists` 
  : 
  `I was unable to fetch the article content directly. Please use your web search capabilities to find and analyze the article.
  CRITICAL WARNING about URLs:
  - ONLY include URLs you can VERIFY are real and accessible
  - DO NOT invent or make up URLs
  - If uncertain about a URL, leave it EMPTY ("")`}` 
: 
`The user has provided text/topic: ${query}
Analyze this topic by searching for the most relevant recent articles and sources.
CRITICAL WARNING about URLs:
- ONLY provide URLs that you have verified exist
- DO NOT make up plausible-looking URLs
- Better to omit a URL than provide a fake one`}

ANALYSIS REQUIREMENTS:
You must comprehensively analyze the content for factual accuracy, bias, and clickbait characteristics.`;

    // Enhanced system prompt with new metrics
    const systemPrompt = `You are an advanced fact-checking and media analysis AI that provides multi-perspective source verification.

CORE MISSION:
Trace every claim back to its original sources, evaluate credibility, detect bias and clickbait, and present findings with full transparency.

ANALYSIS FRAMEWORK:


1. CONTENT EXTRACTION & CLAIM IDENTIFICATION
   - CRITICAL: Extract claims ONLY about the article's main subject matter and content
   - DO NOT extract claims about the news sources themselves (e.g., "BBC is trustworthy")
   - DO NOT extract claims about fact-checking processes
   - ONLY extract claims that are factual assertions made IN the article content
   - Example: For an article about HIV drugs, claims should be about HIV drugs, NOT about BBC News
   - Identify the main topic and narrative framing
   - Use the EXACT headline from the article - DO NOT create your own headline
   - If the article headline is available, you MUST use it verbatim

2. CLAIM EXTRACTION STRATEGY
   - Extract AT LEAST 5 KEY claims (the most important factual assertions)
   - These key claims will be displayed prominently with full details
   - If there are more than 5 significant claims, extract them as ADDITIONAL claims
   - Additional claims should still be factual and important, just less central
   - Aim for 8-12 total claims when possible

3. SOURCE TRACING (Critical - Dig Deeper)
   - For EACH claim, identify the ULTIMATE PRIMARY SOURCE of the information
   - DO NOT stop at the news outlet that reported it - trace back further
   - Example: If Foreign Policy reports trade statistics, find the ORIGINAL source:
     * Chinese Customs data, US Census Bureau, World Trade Organization, etc.
   - Trace the complete information chain: "Primary Data Source → Report/Study → News Article"
   - When a news outlet cites statistics, research, or official data:
     * FIND the original government agency, research institution, or database
     * DO NOT just list the news outlet - go to the source of the data
   - Classify sources as:
     * Primary: Original data sources, court documents, research papers, official government statistics, direct statements from officials
     * Secondary: News reporting with original investigation/reporting
     * Tertiary: News aggregation, opinion pieces, commentary
   - Find sources across the political spectrum (left, center, right)
   - Include publish dates and URLs
   
   EXAMPLE OF PROPER SOURCE TRACING:
   ❌ WRONG: "Foreign Policy (secondary)" for trade statistics
   ✅ CORRECT: "Chinese General Administration of Customs (primary) → Foreign Policy (secondary)"
   
   ❌ WRONG: "BBC News (secondary)" for research findings  
   ✅ CORRECT: "University of Oxford Study (primary) → BBC News (secondary)"

4. FACTUAL ACCURACY METRIC (0-100%)
   Calculate based on:
   - % of claims that can be traced to credible, verifiable sources
   - Quality of sources (primary > secondary > tertiary)
   - Consistency across independent sources
   - Presence of verifiable data, citations, official records
   
   Scoring:
   - 90-100%: Nearly all claims verified by primary sources
   - 70-89%: Most claims verified, mix of primary/secondary sources  
   - 50-69%: Some verification, reliance on secondary sources
   - 30-49%: Limited verification, few credible sources
   - 0-29%: Minimal or no credible sourcing

5. CLICKBAIT LEVEL METRIC (0-100%)
   Evaluate the headline and framing for:
   - Emotional manipulation (fear, outrage, curiosity gaps)
   - Exaggeration or hyperbole
   - Misleading framing vs. actual content
   - Sensationalism over substance
   - "You won't believe..." "Shocking..." patterns
   
   Scoring:
   - 0-20%: Straightforward, descriptive headline
   - 21-40%: Slightly sensational but mostly accurate
   - 41-60%: Noticeably exaggerated or emotional
   - 61-80%: Highly sensational, misleading framing
   - 81-100%: Pure clickbait, deceptive headline

6. BIAS LEVEL METRIC (0-100%)
   Assess partisan lean and agenda-driven framing:
   - Language choice (loaded words, framing)
   - Source selection (only citing aligned sources)
   - Omission of contrary perspectives
   - Emotional vs. neutral tone
   - Presentation of opinion as fact
   
   Scoring:
   - 0-20%: Balanced, neutral presentation
   - 21-40%: Slight lean, mostly fair
   - 41-60%: Clear bias, some balance attempts
   - 61-80%: Strong bias, minimal opposing views
   - 81-100%: Extreme bias, propaganda-like

7. POLITICAL SPECTRUM ANALYSIS
   ${isUrl ? 'ONLY if the content is political in nature,' : 'ONLY for political topics,'}
   provide spectrum_coverage showing distribution of sources across:
   - left: Progressive/liberal sources
   - center: Centrist/neutral sources  
   - right: Conservative sources

8. CONFIDENCE RATINGS
   For each claim, provide confidence (0-1) based on:
   - Source quality and independence
   - Corroboration across sources
   - Recency and relevance of evidence

REQUIRED JSON OUTPUT:
{
  "topic": "string - main subject",
  "headline": "string - MUST be the exact article headline if URL provided, otherwise create descriptive headline about the topic",
  "summary": "string - AI-written 2-3 sentence summary of sourcing quality and key findings",
  "claims": [
    {
      "claim_text": "string - ONLY factual claims from the article content itself, NOT about the sources or outlets",
      "confidence": 0.85,
      "confidence_explanation": "string - brief 1-2 sentence explanation of why this confidence level",
      "position": 1,
      "source_chain": "string - CRITICAL: Trace to PRIMARY sources. Format: 'Primary Source Name (primary) [url] → News Outlet (secondary) [url]'. Example: 'Chinese General Administration of Customs (primary) [https://customs.gov.cn] → Foreign Policy (secondary) [https://...]'. DO NOT stop at news outlets when they cite official data/research."
    }
  ],
  "sources": [
    {
      "outlet_name": "string",
      "url": "string",
      "publish_date": "2025-01-01T00:00:00Z",
      "political_lean": "left|center|right (optional, only for political content)",
      "source_type": "primary|secondary|tertiary",
      "category": "news outlet|government agency|research institution|individual|political party|etc",
      "image_url": "string (optional - relevant image from the source page)"
    }
  ],
  "citations": [
    {
      "claim_index": 0,
      "source_index": 0,
      "excerpt": "string - direct quote from source",
      "rationale": "string - why this source supports the claim",
      "page_number": "string - page/timestamp/section reference"
    }
  ],
  "edges": [
    {
      "source_index": 0,
      "target_index": 1,
      "edge_type": "cites|derives_from|republishes|contradicts"
    }
  ],
  "metrics": {
    "factual_accuracy": 85,
    "factual_accuracy_explanation": "string - brief explanation of the score",
    "clickbait_level": 30,
    "clickbait_explanation": "string - brief explanation of the score",
    "bias_level": 45,
    "bias_explanation": "string - brief explanation of the score",
    "transparency_score": 0.90,
    "transparency_explanation": "string - brief explanation of the score",
    "confidence_score": 0.85,
    "confidence_explanation": "string - brief explanation of the score",
    "spectrum_coverage": "full|partial|limited|none",
    "political_distribution": {
      "left": 3,
      "center": 2,
      "right": 2
    }
  }
}

CRITICAL RULES:
- Return ONLY valid JSON, no markdown code blocks
- Every claim must have traceable sources
- Provide the complete source chain for transparency
- Be objective in bias assessment (detect bias in any direction)
- ${isUrl ? 'Analyze the actual content from the provided URL' : 'Search for and analyze relevant content'}`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${prePrompt}\n\n${actualContent}` }
        ],
        temperature: 0.2,
        top_p: 0.9,
        search_domain_filter: [],
        return_images: false,
        return_related_questions: false,
        search_recency_filter: 'month',
        frequency_penalty: 1,
        presence_penalty: 0
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze query', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Perplexity response received');

    const content = data.choices[0].message.content;
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let analysisData;
    try {
      analysisData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError, jsonStr);
      return new Response(
        JSON.stringify({ error: 'Invalid response format from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate sources
    const seenUrls = new Set<string>();
    const seenNames = new Set<string>();
    const uniqueSources = [];
    
    for (const source of (analysisData.sources || [])) {
      const key = `${source.outlet_name.toLowerCase()}_${source.url || ''}`;
      const nameKey = source.outlet_name.toLowerCase();
      
      if (!seenUrls.has(key) && !seenNames.has(nameKey)) {
        seenUrls.add(key);
        seenNames.add(nameKey);
        uniqueSources.push(source);
      }
    }
    
    analysisData.sources = uniqueSources;
    
    // Validate all URLs in sources
    console.log('Validating source URLs...');
    for (const source of analysisData.sources) {
      if (source.url && source.url.trim() !== '') {
        const isValid = await validateUrl(source.url);
        source.url_valid = isValid;
        if (!isValid) {
          console.warn(`Invalid/unreachable URL: ${source.url}`);
        }
      } else {
        source.url_valid = false;
      }
    }
    
    // Filter out invalid edges (missing source_index or target_index)
    if (analysisData.edges) {
      analysisData.edges = analysisData.edges.filter((edge: any) => {
        const isValid = typeof edge.source_index === 'number' && typeof edge.target_index === 'number';
        if (!isValid) {
          console.warn('Filtering out invalid edge:', edge);
        }
        return isValid;
      });
    }
    
    // Add metadata about extraction
    analysisData.extraction_metadata = {
      content_extracted: extractionSuccess,
      original_url: isUrl ? query : null,
      extraction_timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(analysisData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-query function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
