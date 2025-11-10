-- Add UPDATE policy for user_reports table
CREATE POLICY "Users can update their own reports" 
ON public.user_reports 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);