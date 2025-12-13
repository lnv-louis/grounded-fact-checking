# Key Claims UI Display Pattern

This document describes how to parse and display news claims with source traceability, confidence scores, and source chains - as implemented in the Grounded project.

## Screenshot Reference

The UI displays news claims as a list of cards, each containing:
- **Claim text** (main headline/assertion)
- **Confidence badge** (percentage, color-coded)
- **Confidence explanation** (grey subtext)
- **Source chain** (badges showing source attribution flow)

---

## 1. Data Schema

### Claim Object

```typescript
interface Claim {
  claim_text: string;           // The main claim/assertion text
  confidence: number;           // 0.0 to 1.0 (displayed as percentage)
  confidence_explanation?: string; // Why this confidence level was assigned
  position: number;             // Order/index of the claim
  source_chain?: string;        // Attribution chain (see format below)
}
```

### Source Object

```typescript
interface Source {
  outlet_name: string;                          // e.g., "The Guardian"
  url: string;                                  // Full URL to the article
  url_valid?: boolean;                          // Whether URL was verified
  publish_date?: string | null;                 // ISO date or null
  political_lean?: 'left' | 'center' | 'right' | '';
  source_type: 'primary' | 'secondary' | 'tertiary';
  category?: string;                            // e.g., "Politics", "Technology"
  image_url?: string;                           // Optional thumbnail
}
```

---

## 2. Source Chain Format

The `source_chain` field uses a specific string format to represent attribution:

```
{SourceName} ({type}) [{url}] → {SourceName} ({type}) [{url}]
```

### Examples:

```
Downing Street official spokesperson (primary) → The Guardian (secondary) [https://theguardian.com/article]
```

```
NASA Official Statement (primary) [https://nasa.gov/press] → Reuters (secondary) [https://reuters.com/article] → BBC News (tertiary) [https://bbc.com/news]
```

### Parsing Logic:

```typescript
const parseSourceChain = (chain: string) => {
  const parts = chain.split('→').map(s => s.trim());
  return parts.map(part => {
    // Match: "SourceName (type) [optional-url]"
    const match = part.match(/^(.+?)\s*\((\w+)\)(?:\s*\[(.+?)\])?$/);
    if (match) {
      return {
        name: match[1].trim(),
        type: match[2] as 'primary' | 'secondary' | 'tertiary',
        url: match[3]?.trim(),
      };
    }
    return { name: part, type: 'secondary' as const, url: undefined };
  });
};
```

---

## 3. UI Display Rules

### Confidence Badge Colors

| Confidence Range | Background | Text Color | Border |
|------------------|------------|------------|--------|
| ≥ 80% (0.8)      | green-500/20 | green-400 | green-500/30 |
| 60-79% (0.6-0.79)| yellow-500/20 | yellow-400 | yellow-500/30 |
| < 60% (< 0.6)    | red-500/20 | red-400 | red-500/30 |

### Source Type Badge Colors

| Type | Background | Text Color | Border |
|------|------------|------------|--------|
| primary | green-500/10 | green-400 | green-500/20 |
| secondary | yellow-500/10 | yellow-400 | yellow-500/20 |
| tertiary | orange-500/10 | orange-400 | orange-500/20 |

---

## 4. Component Structure (React/Tailwind)

```tsx
// ClaimCard Component
<Card className="p-4 bg-card/50 border-border/50 hover:border-primary/50 transition-all">
  {/* Header Row: Claim Text + Confidence Badge */}
  <div className="flex items-start justify-between gap-3">
    <p className="text-foreground flex-1">{claim.claim_text}</p>
    <Badge 
      variant="outline" 
      className={`shrink-0 ${getConfidenceStyles(claim.confidence)}`}
    >
      {Math.round(claim.confidence * 100)}%
    </Badge>
  </div>

  {/* Confidence Explanation */}
  {claim.confidence_explanation && (
    <p className="text-xs text-muted-foreground mt-2">
      {claim.confidence_explanation}
    </p>
  )}

  {/* Source Chain */}
  {sourceChain.length > 0 && (
    <div className="mt-3 pt-3 border-t border-border/30">
      <div className="flex flex-wrap items-center gap-2">
        {sourceChain.map((source, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className={getTypeStyles(source.type)}>
                  {source.name}
                </Badge>
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            ) : (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className={getTypeStyles(source.type)}>
                  {source.name}
                </Badge>
                <span className="text-xs text-muted-foreground italic">
                  cited by article
                </span>
              </div>
            )}
            {idx < sourceChain.length - 1 && (
              <span className="text-muted-foreground">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )}
</Card>
```

---

## 5. LangGraph Agent Prompt Template

When generating claims from NewsAPI data, use this prompt to structure the output:

```
You are analyzing news articles to extract verifiable claims with source attribution.

For each significant claim in the article, create a claim object with:

1. **claim_text**: The exact assertion or statement being made. Should be a complete, standalone sentence.

2. **confidence**: A score from 0.0 to 1.0 based on:
   - 0.8-1.0: Directly quoted from primary source, verifiable, multiple corroborations
   - 0.6-0.79: Attributed to credible secondary source, consistent with known facts
   - 0.4-0.59: Single source, unverified, or contains hedging language
   - 0.0-0.39: Speculation, anonymous sources, or contradicted by other sources

3. **confidence_explanation**: One sentence explaining WHY this confidence level was assigned.

4. **source_chain**: Format as:
   "{OriginalSource} ({type}) → {ReportingOutlet} ({type}) [{url}]"
   
   Types:
   - primary: Official statements, press releases, direct quotes from involved parties
   - secondary: News outlets reporting on primary sources
   - tertiary: Aggregators, opinion pieces, or sources citing other news reports

Example output:
{
  "claim_text": "The Prime Minister confirmed that the policy will take effect in January.",
  "confidence": 0.9,
  "confidence_explanation": "This is a direct quote from the PM's official spokesperson, confirmed in the press briefing.",
  "source_chain": "PM's Office (primary) → BBC News (secondary) [https://bbc.com/news/uk-12345]",
  "position": 1
}
```

---

## 6. NewsAPI to Claims Mapping

When processing NewsAPI results, map fields as follows:

```typescript
// From NewsAPI response
interface NewsAPIArticle {
  title: string;
  description: string;
  content: string;
  source: { name: string };
  url: string;
  publishedAt: string;
}

// Transform to Source
const mapToSource = (article: NewsAPIArticle): Source => ({
  outlet_name: article.source.name,
  url: article.url,
  publish_date: article.publishedAt,
  source_type: 'secondary', // News outlets are typically secondary
  category: 'News',
});

// Claims should be extracted from content analysis
// The source_chain should reference the outlet:
// "{OriginalSource} (primary) → {article.source.name} (secondary) [{article.url}]"
```

---

## 7. Display Layout Options

### Full Display (Key Claims)
- Show first 5 claims with full detail
- Include source chain, confidence explanation
- Larger padding, more prominent

### Compact Display (Additional Claims)
- Collapsible cards in a grid layout
- 2-line text clamp initially
- Expand on click to show full details

```tsx
// Layout structure
<div className="space-y-6">
  {/* Key Claims - Full Display */}
  <div className="space-y-3">
    {claims.slice(0, 5).map((claim, idx) => (
      <ClaimCard key={idx} claim={claim} compact={false} />
    ))}
  </div>

  {/* Additional Claims - Compact Grid */}
  {claims.length > 5 && (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {claims.slice(5).map((claim, idx) => (
        <ClaimCard key={idx} claim={claim} compact={true} />
      ))}
    </div>
  )}
</div>
```

---

## 8. Hover Popup (Optional Enhancement)

For desktop, show a detailed popup on hover with:
- Source traceability breakdown
- Color-coded source type indicators
- Category and publish date from matched sources
- Full confidence explanation

Position the popup relative to cursor, checking viewport bounds to prevent overflow.

---

## Summary

The key elements for displaying claims like Grounded:

1. **Data structure**: Claims with text, confidence (0-1), explanation, and source_chain string
2. **Source chain format**: `Name (type) [url] → Name (type) [url]`
3. **Color coding**: Green (≥80%), Yellow (60-79%), Red (<60%)
4. **Source types**: Primary (green), Secondary (yellow), Tertiary (orange)
5. **Layout**: Cards with claim text, confidence badge, explanation, and source chain badges
6. **Interaction**: External links open in new tab, arrows (→) connect the chain
