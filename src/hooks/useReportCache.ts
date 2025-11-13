import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalysisResult } from '@/lib/types';
import { toast } from 'sonner';

interface CachedReport {
  query: string;
  result: AnalysisResult;
  timestamp: number;
}

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export const useReportCache = () => {
  const [cache, setCache] = useState<Map<string, CachedReport>>(new Map());

  // Load cache from localStorage on mount
  useEffect(() => {
    const savedCache = localStorage.getItem('report-cache');
    if (savedCache) {
      try {
        const parsed = JSON.parse(savedCache);
        const cacheMap = new Map<string, CachedReport>(Object.entries(parsed));
        
        // Filter out expired entries
        const now = Date.now();
        const validEntries = Array.from(cacheMap.entries()).filter(
          ([, value]) => now - value.timestamp < CACHE_DURATION
        );
        
        setCache(new Map<string, CachedReport>(validEntries));
      } catch (error) {
        console.error('Failed to load cache:', error);
      }
    }
  }, []);

  // Save cache to localStorage whenever it changes
  useEffect(() => {
    const cacheObject = Object.fromEntries(cache);
    localStorage.setItem('report-cache', JSON.stringify(cacheObject));
  }, [cache]);

  const getCachedReport = useCallback((query: string): AnalysisResult | null => {
    const cached = cache.get(query);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > CACHE_DURATION;
    if (isExpired) {
      setCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(query);
        return newCache;
      });
      return null;
    }

    return cached.result;
  }, [cache]);

  const setCachedReport = useCallback((query: string, result: AnalysisResult) => {
    setCache(prev => {
      const newCache = new Map(prev);
      newCache.set(query, {
        query,
        result,
        timestamp: Date.now(),
      });
      return newCache;
    });
  }, []);

  const saveReportToDatabase = useCallback(async (
    query: string,
    result: AnalysisResult,
    userId: string
  ) => {
    try {
      // Check if a report for this user and query already exists
      const { data: existing, error: selectError } = await supabase
        .from('user_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('query', query)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.warn('Could not verify existing report, proceeding to save:', selectError);
      }

      if (existing) {
        // Already saved, skip insert
        return;
      }

      const { error } = await supabase
        .from('user_reports')
        .insert({
          user_id: userId,
          query,
          headline: result.headline,
          topic: result.topic,
          summary: result.summary,
          analysis_data: result,
        });

      if (error) throw error;
    } catch (error: any) {
      console.error('Failed to save report:', error);
      toast.error('Failed to save report to your account');
    }
  }, []);

  const clearCache = useCallback(() => {
    setCache(new Map());
    localStorage.removeItem('report-cache');
  }, []);

  return {
    getCachedReport,
    setCachedReport,
    saveReportToDatabase,
    clearCache,
  };
};
