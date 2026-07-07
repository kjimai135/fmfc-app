import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vqbyatnatfotmhmpdyvj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxYnlhdG5hdGZvdG1obXBkeXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MjQ3MDUsImV4cCI6MjA5OTAwMDcwNX0.Bb0nMPSpqyUMHVizWcJChVSCxgARl4zgY8fJR-IQy_U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)