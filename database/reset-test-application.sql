    -- Reset test application status back to submitted for testing revision notes
    UPDATE public.applications 
    SET 
        status = 'revision_required',
        updated_at = NOW()
    WHERE application_number = 'RWB-25-00001'; 