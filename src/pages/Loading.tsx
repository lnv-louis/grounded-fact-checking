import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { AnalysisResultSchema } from "@/lib/types";
import { toast } from "sonner";
import logo from "@/assets/grounded-logo.png";
import { useReportCache } from "@/hooks/useReportCache";

const Loading = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const query = location.state?.query;
  const [error, setError] = useState<string | null>(null);
  const [isApiComplete, setIsApiComplete] = useState(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { getCachedReport, setCachedReport, saveReportToDatabase } = useReportCache();
  const [progressBars, setProgressBars] = useState({
    analyzing: 0,
    fetching: 0,
    extracting: 0,
    computing: 0,
    building: 0,
  });

  useEffect(() => {
    if (!query) {
      navigate("/");
      return;
    }

    // Check auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Check cache first
    const cached = getCachedReport(query);
    if (cached) {
      // Instantly set all progress bars to complete for cached results
      setProgressBars({
        analyzing: 100,
        fetching: 100,
        extracting: 100,
        computing: 100,
        building: 100,
      });
      setApiResult(cached);
      setIsApiComplete(true);
      setIsFromCache(true); // Mark as from cache to prevent duplicate DB save
      toast.success("Loaded from cache");
      return;
    }

    // Start the API call
    const analyzeQuery = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('analyze-query', {
          body: { query }
        });

        if (error) throw error;

        // Validate response
        const result = AnalysisResultSchema.parse(data);
        setApiResult(result);
        setIsApiComplete(true);
        setIsFromCache(false); // Explicitly mark as fresh API result
        
        // Cache the result
        setCachedReport(query, result);
      } catch (err: any) {
        console.error('Analysis error:', err);
        setError(err.message || 'Failed to analyze query');
        toast.error(err.message || 'Failed to analyze query');
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    };

    analyzeQuery();
  }, [query, navigate, getCachedReport, setCachedReport]);

  // Animate progress bars independently
  useEffect(() => {
    if (error) return;

    const animateBar = (key: keyof typeof progressBars, delay: number, duration: number, maxProgress: number = 100) => {
      setTimeout(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / duration) * maxProgress, maxProgress);
          
          setProgressBars(prev => ({ ...prev, [key]: progress }));
          
          if (progress >= maxProgress) {
            clearInterval(interval);
          }
        }, 16); // ~60fps
      }, delay);
    };

    // Stagger the progress bars - much slower to match realistic API response time
    animateBar('analyzing', 0, 4000);
    animateBar('fetching', 2000, 6000);
    animateBar('extracting', 4000, 8000);
    animateBar('computing', 8000, 10000);
    animateBar('building', 12000, 15000, 95); // Only goes to 95%, waits for API
  }, [error]);

  // Complete the last progress bar when API is done
  useEffect(() => {
    if (isApiComplete && progressBars.building < 100) {
      setProgressBars(prev => ({ ...prev, building: 100 }));
    }
  }, [isApiComplete, progressBars.building]);

  // Navigate when both API and animations are complete
  useEffect(() => {
    const allComplete = Object.values(progressBars).every(v => v >= 100);
    if (isApiComplete && allComplete && apiResult) {
      // Only save to database if user is logged in AND result is NOT from cache
      if (user && !isFromCache) {
        saveReportToDatabase(query, apiResult, user.id);
      }
      
      setTimeout(() => {
        navigate('/results', { 
          state: { 
            result: apiResult,
            originalQuery: query
          }, 
          replace: true 
        });
      }, 300);
    }
  }, [isApiComplete, progressBars, apiResult, query, navigate, user, saveReportToDatabase, isFromCache]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Granular mesh gradient background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 mesh-gradient opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-background via-accent/20 to-background" />
      </div>

      <div className="relative z-10 w-full max-w-2xl px-6">
        <Card className="p-8 bg-card/80 backdrop-blur-md border-border/50">
          <div className="flex flex-col items-center space-y-6">
            <img src={logo} alt="Grounded" className="h-16 w-16 animate-pulse" />
            <h2 className="text-2xl font-bold text-center">
              {error ? 'Analysis Failed' : 'Generating Your Report'}
            </h2>
            
            {error ? (
              <div className="w-full space-y-4">
                <p className="text-center text-destructive">{error}</p>
                <p className="text-center text-sm text-muted-foreground">Redirecting to homepage...</p>
              </div>
            ) : (
              <div className="w-full space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">Analyzing query...</span>
                      <span className="text-muted-foreground">{Math.round(progressBars.analyzing)}%</span>
                    </div>
                    <Progress value={progressBars.analyzing} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">Fetching sources...</span>
                      <span className="text-muted-foreground">{Math.round(progressBars.fetching)}%</span>
                    </div>
                    <Progress value={progressBars.fetching} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">Extracting claims...</span>
                      <span className="text-muted-foreground">{Math.round(progressBars.extracting)}%</span>
                    </div>
                    <Progress value={progressBars.extracting} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">Computing metrics...</span>
                      <span className="text-muted-foreground">{Math.round(progressBars.computing)}%</span>
                    </div>
                    <Progress value={progressBars.computing} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">Building visualizations...</span>
                      <span className="text-muted-foreground">{Math.round(progressBars.building)}%</span>
                    </div>
                    <Progress value={progressBars.building} className="h-2" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Loading;
