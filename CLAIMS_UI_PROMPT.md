# News Studio UI Display Pattern

This document describes how to parse and display news articles in a research environment with topic-based organization, sentiment analysis, and source aggregation.

## Use Case

A **News Research Environment** that:
- Aggregates news from NewsAPI by topic/watchlist
- Displays articles in organized, scannable rows
- Shows sentiment analysis (Positive/Neutral/Negative)
- Tracks sources and article counts
- Supports AI-generated topic suggestions

---

## 1. Data Schemas

### Article Object (from NewsAPI)

```typescript
interface Article {
  id: string;                    // Unique identifier
  title: string;                 // Article headline
  description: string;           // Short summary/excerpt
  content: string;               // Full article text (if available)
  url: string;                   // Link to original article
  image_url?: string;            // Thumbnail image
  published_at: string;          // ISO timestamp
  source: {
    name: string;                // e.g., "Reuters", "Bloomberg"
    url?: string;                // Source homepage
  };
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentiment_score?: number;      // -1.0 to 1.0
  topics?: string[];             // Associated topics/tags
}
```

### Topic/Watchlist Object

```typescript
interface Topic {
  id: string;
  name: string;                  // e.g., "US inflation soft landing outlook"
  query: string;                 // Search query for NewsAPI
  article_count: number;
  source_count: number;
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  last_updated: string;
}
```

### Dashboard Metrics

```typescript
interface DashboardMetrics {
  articles: number;              // Total articles in watchlist
  sources: number;               // Unique sources
  positive: number;              // Articles with positive sentiment
  neutral: number;               // Articles with neutral sentiment
  negative: number;              // Articles with negative sentiment
}
```

---

## 2. UI Components

### Article Row Card

Each article displays as a card/row with:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [THUMBNAIL] │ HEADLINE TEXT                                   │ [BADGE] │
│             │ Source Name • Published Date                    │  85%    │
│             │ Short description excerpt text...               │         │
│             │                                                 │         │
│             │ [Source Badge] cited by article → [Outlet] ↗    │         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Structure (React/Tailwind)

```tsx
interface ArticleCardProps {
  article: Article;
  showSentiment?: boolean;
}

const ArticleCard = ({ article, showSentiment = true }: ArticleCardProps) => (
  <Card className="p-4 bg-card/50 border-border/50 hover:border-primary/50 transition-all">
    <div className="flex gap-4">
      {/* Optional Thumbnail */}
      {article.image_url && (
        <div className="shrink-0 w-24 h-24 rounded-lg overflow-hidden">
          <img 
            src={article.image_url} 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="flex-1 min-w-0 space-y-2">
        {/* Title + Sentiment */}
        <div className="flex items-start justify-between gap-3">
          <a 
            href={article.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-foreground font-medium hover:text-primary transition-colors line-clamp-2"
          >
            {article.title}
          </a>
          
          {showSentiment && article.sentiment && (
            <Badge 
              variant="outline" 
              className={getSentimentStyles(article.sentiment)}
            >
              {article.sentiment}
            </Badge>
          )}
        </div>
        
        {/* Meta: Source + Date */}
        <p className="text-xs text-muted-foreground">
          {article.source.name} • {formatDate(article.published_at)}
        </p>
        
        {/* Description */}
        {article.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {article.description}
          </p>
        )}
        
        {/* Source Attribution */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/30">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            {article.source.name}
          </Badge>
          <span className="text-xs text-muted-foreground">→</span>
          <a 
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            View Article
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  </Card>
);
```

---

## 3. Sentiment Styling

### Sentiment Badge Colors

| Sentiment | Background | Text Color | Border |
|-----------|------------|------------|--------|
| positive  | green-500/20 | green-400 | green-500/30 |
| neutral   | gray-500/20 | gray-400 | gray-500/30 |
| negative  | red-500/20 | red-400 | red-500/30 |

```typescript
const getSentimentStyles = (sentiment: 'positive' | 'neutral' | 'negative') => {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'neutral':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'negative':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
};
```

---

## 4. Dashboard Layout

### Metrics Cards Row

```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
  <MetricCard label="ARTICLES" value={metrics.articles} />
  <MetricCard label="SOURCES" value={metrics.sources} />
  <MetricCard label="POSITIVE" value={metrics.positive} variant="positive" />
  <MetricCard label="NEUTRAL" value={metrics.neutral} variant="neutral" />
  <MetricCard label="NEGATIVE" value={metrics.negative} variant="negative" />
</div>

const MetricCard = ({ label, value, variant }: MetricCardProps) => (
  <Card className="p-4 bg-card/50 border-border/50">
    <p className="text-xs text-muted-foreground uppercase tracking-wide">
      {label}
    </p>
    <Badge 
      variant="outline" 
      className={`mt-2 text-lg font-mono ${
        variant === 'positive' ? 'bg-green-500/10 text-green-400' :
        variant === 'negative' ? 'bg-red-500/10 text-red-400' :
        variant === 'neutral' ? 'bg-gray-500/10 text-gray-400' :
        'bg-muted text-foreground'
      }`}
    >
      {value}
    </Badge>
  </Card>
);
```

### Topic Sidebar (AI Topic Builder)

```tsx
<Card className="p-4">
  <div className="flex items-center gap-2 mb-4">
    <Sparkles className="h-4 w-4 text-primary" />
    <h3 className="font-semibold">AI Topic Builder</h3>
  </div>
  
  <div className="flex gap-2 mb-4">
    <Input 
      placeholder="Ask for a theme (e.g., Fed path, chip cycle..." 
      className="flex-1"
    />
    <Button size="sm">Go</Button>
  </div>
  
  <div className="space-y-2">
    {suggestedTopics.map((topic, idx) => (
      <button
        key={idx}
        onClick={() => onSelectTopic(topic)}
        className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border/50 hover:bg-muted/50 hover:border-primary/50 transition-all"
      >
        {topic}
      </button>
    ))}
  </div>
</Card>
```

---

## 5. Articles List Component

```tsx
interface ArticlesListProps {
  articles: Article[];
  isLoading?: boolean;
}

const ArticlesList = ({ articles, isLoading }: ArticlesListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground font-mono">
          No articles available.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
};
```

---

## 6. LangGraph Agent Prompt Template

Use this prompt when processing NewsAPI results with your LangGraph agent:

```
You are a news research assistant processing articles from NewsAPI. Your task is to:

1. **Analyze sentiment** for each article:
   - positive: Good news, achievements, growth, solutions
   - neutral: Factual reporting, balanced coverage, informational
   - negative: Problems, risks, failures, concerns, warnings

2. **Extract key topics/tags** that describe what the article is about.

3. **Format each article** with this structure:

{
  "id": "unique-id",
  "title": "Article headline",
  "description": "Brief excerpt or summary",
  "url": "https://...",
  "image_url": "https://... (if available)",
  "published_at": "2024-01-15T10:30:00Z",
  "source": {
    "name": "Source Name"
  },
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": 0.75, // -1.0 (very negative) to 1.0 (very positive)
  "topics": ["topic1", "topic2"]
}

4. **Aggregate metrics**:
   - Count total articles
   - Count unique sources
   - Tally sentiment breakdown (positive/neutral/negative counts)

Return results as a structured object with:
- articles: Article[]
- metrics: { articles, sources, positive, neutral, negative }
```

---

## 7. NewsAPI Integration

### Fetching Articles

```typescript
const fetchArticles = async (query: string): Promise<Article[]> => {
  const response = await fetch(
    `https://newsapi.ai/api/v1/articles?` + 
    new URLSearchParams({
      apiKey: NEWSAPI_KEY,
      keyword: query,
      articlesCount: '50',
      articlesSortBy: 'date',
      includeArticleImage: 'true',
    })
  );
  
  const data = await response.json();
  
  return data.articles.results.map((item: any) => ({
    id: item.uri,
    title: item.title,
    description: item.body?.substring(0, 200) + '...',
    content: item.body,
    url: item.url,
    image_url: item.image,
    published_at: item.dateTime,
    source: {
      name: item.source.title,
      url: item.source.uri,
    },
    // Sentiment should be analyzed by your LangGraph agent
    sentiment: undefined,
    sentiment_score: undefined,
    topics: item.concepts?.map((c: any) => c.label.eng) || [],
  }));
};
```

---

## 8. Watchlist Topics Examples

Pre-configured topic suggestions for the AI Topic Builder:

```typescript
const defaultTopicSuggestions = [
  "US inflation soft landing outlook",
  "AI chip supply chain dynamics",
  "ECB policy shift expectations",
  "Semiconductor inventory digestion",
  "China tech regulation updates",
  "Energy transition investments",
  "Fed rate path projections",
  "Crypto institutional adoption",
];
```

---

## Summary

Key elements for the News Studio research environment:

1. **Data**: Articles with title, source, date, description, sentiment, topics
2. **Metrics**: Article count, source count, sentiment breakdown (positive/neutral/negative)
3. **Layout**: Dashboard with metric cards, topic sidebar, article list
4. **Cards**: Article rows with source badges, external links, optional thumbnails
5. **Sentiment**: Color-coded (green/gray/red) badges for positive/neutral/negative
6. **Topics**: AI-suggested research themes, searchable watchlists
7. **Empty state**: "No articles available." message with monospace font
