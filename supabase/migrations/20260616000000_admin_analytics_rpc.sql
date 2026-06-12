-- 정밀 분석을 위한 집계 RPC

CREATE OR REPLACE FUNCTION public.admin_get_token_usage_stats(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_dept_name TEXT DEFAULT NULL,
    p_team_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    group_type TEXT,
    group_name TEXT,
    ai_model TEXT,
    total_prompt_tokens NUMERIC,
    total_completion_tokens NUMERIC,
    total_cost NUMERIC,
    usage_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 권한 체크
    IF (SELECT role FROM public.users WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        'department'::TEXT AS group_type,
        v.dept_name::TEXT AS group_name,
        v.ai_model::TEXT,
        SUM(v.prompt_tokens)::NUMERIC AS total_prompt_tokens,
        SUM(v.completion_tokens)::NUMERIC AS total_completion_tokens,
        SUM(v.total_cost)::NUMERIC AS total_cost,
        COUNT(v.log_id)::BIGINT AS usage_count
    FROM public.vw_admin_token_usage v
    WHERE 
        (p_start_date IS NULL OR v.created_at >= p_start_date) AND
        (p_end_date IS NULL OR v.created_at <= p_end_date) AND
        (p_dept_name IS NULL OR v.dept_name = p_dept_name) AND
        (p_team_name IS NULL OR v.team_name = p_team_name)
    GROUP BY v.dept_name, v.ai_model
    
    UNION ALL
    
    SELECT 
        'team'::TEXT AS group_type,
        v.team_name::TEXT AS group_name,
        v.ai_model::TEXT,
        SUM(v.prompt_tokens)::NUMERIC AS total_prompt_tokens,
        SUM(v.completion_tokens)::NUMERIC AS total_completion_tokens,
        SUM(v.total_cost)::NUMERIC AS total_cost,
        COUNT(v.log_id)::BIGINT AS usage_count
    FROM public.vw_admin_token_usage v
    WHERE 
        (p_start_date IS NULL OR v.created_at >= p_start_date) AND
        (p_end_date IS NULL OR v.created_at <= p_end_date) AND
        (p_dept_name IS NULL OR v.dept_name = p_dept_name) AND
        (p_team_name IS NULL OR v.team_name = p_team_name)
    GROUP BY v.team_name, v.ai_model
    
    UNION ALL
    
    SELECT 
        'employee'::TEXT AS group_type,
        v.employee_name::TEXT AS group_name,
        v.ai_model::TEXT,
        SUM(v.prompt_tokens)::NUMERIC AS total_prompt_tokens,
        SUM(v.completion_tokens)::NUMERIC AS total_completion_tokens,
        SUM(v.total_cost)::NUMERIC AS total_cost,
        COUNT(v.log_id)::BIGINT AS usage_count
    FROM public.vw_admin_token_usage v
    WHERE 
        (p_start_date IS NULL OR v.created_at >= p_start_date) AND
        (p_end_date IS NULL OR v.created_at <= p_end_date) AND
        (p_dept_name IS NULL OR v.dept_name = p_dept_name) AND
        (p_team_name IS NULL OR v.team_name = p_team_name)
    GROUP BY v.employee_name, v.ai_model;

END;
$$;
