"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Clock, MessageSquare, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Comment {
  id: string;
  author: string;
  role: string;
  avatar: string;
  content: string;
  timestamp: string;
  created_at: string;
  authorId: string | null;
  editable: boolean;
}

interface ApplicationCommentsProps {
  applicationId: string;
}

type WorkflowEvent = {
  id: string;
  userId: string | null;
  actorName: string;
  actorRole: string;
  avatar: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  comment: string | null;
  createdAt: string;
};

function humanizeStatus(s?: string | null) {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function ApplicationComments({ applicationId }: ApplicationCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, userProfile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComments = async () => {
      if (!applicationId) return;
      try {
        setLoading(true);
        setError(null);
        console.log('🔍 [ApplicationComments] Fetching comments for application:', applicationId);
        
        // First get the reviews data without joins
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*')
          .eq('application_id', applicationId)
          .order('created_at', { ascending: false });
          
        console.log('📊 [ApplicationComments] Reviews query result:', { 
          reviews: reviewData?.length || 0, 
          error: reviewError?.message 
        });
        
        if (reviewError) {
          console.error('❌ [ApplicationComments] Reviews query error:', reviewError);
          setError('Failed to load reviews');
          return;
        }

        if (!reviewData || reviewData.length === 0) {
          console.log('📝 [ApplicationComments] No reviews found for this application');
          setComments([]);
          return;
        }

        // Fetch reviewer data separately for each review
        const commentsWithReviewers = await Promise.all(
          reviewData.map(async (review: any) => {
            let reviewer = null;
            
            if (review.reviewer_id) {
              const { data: reviewerData } = await supabase
                .from('users')
                .select('first_name, last_name, role')
                .eq('id', review.reviewer_id)
                .single();
              reviewer = reviewerData;
            }
            
            const name = reviewer ? `${reviewer.first_name} ${reviewer.last_name}` : 'Unknown User';
            const initials = reviewer ? 
              `${reviewer.first_name?.[0] || ''}${reviewer.last_name?.[0] || ''}`.toUpperCase() : 'UU';
            
            const isInternalNote = review.review_stage === "internal" && !!review.overall_comments;
            return {
              id: review.id,
              author: name,
              role: reviewer?.role || 'reviewer',
              avatar: initials,
              content: review.overall_comments || review.technical_review || 'No comments',
              timestamp: new Date(review.created_at).toLocaleString(),
              created_at: review.created_at,
              authorId: review.reviewer_id ?? null,
              editable: isInternalNote,
            };
          })
        );

        console.log('✅ [ApplicationComments] Formatted comments:', commentsWithReviewers.length);
        setComments(commentsWithReviewers);
      } catch (err) {
        console.error('❌ [ApplicationComments] Error fetching comments:', err);
        setError('Failed to load comments');
      } finally {
        setLoading(false);
      }
    };
    if (applicationId) fetchComments();
  }, [applicationId, user?.id]);

  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!applicationId) return;
      try {
        setEventsLoading(true);
        setEventsError(null);

        const { data, error } = await supabase
          .from("workflow_history")
          .select("id, application_id, user_id, from_status, to_status, action, comment, created_at")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        const rows = (data as any[]) || [];

        const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
        let usersById = new Map<string, any>();
        if (userIds.length > 0) {
          const { data: usersData, error: usersErr } = await supabase
            .from("users")
            .select("id, first_name, last_name, role")
            .in("id", userIds);
          if (usersErr) throw usersErr;
          (usersData || []).forEach((u: any) => usersById.set(u.id, u));
        }

        const formatted: WorkflowEvent[] = rows.map((r) => {
          const actor = r.user_id ? usersById.get(r.user_id) : null;
          const first = actor?.first_name ?? "";
          const last = actor?.last_name ?? "";
          const name = actor ? `${first} ${last}`.trim() || "Unknown User" : "System";
          const initials = actor
            ? `${(first?.[0] || "")}${(last?.[0] || "")}`.toUpperCase() || "UU"
            : "SY";

          return {
            id: r.id,
            userId: r.user_id ?? null,
            actorName: name,
            actorRole: actor?.role || "system",
            avatar: initials,
            fromStatus: r.from_status ?? null,
            toStatus: r.to_status,
            action: r.action,
            comment: r.comment ?? null,
            createdAt: r.created_at,
          };
        });

        setEvents(formatted);
      } catch (e: any) {
        console.error("❌ [ApplicationComments] Failed to fetch workflow history:", e);
        setEventsError(e?.message || "Failed to load timeline");
      } finally {
        setEventsLoading(false);
      }
    };

    if (applicationId) fetchWorkflow();
  }, [applicationId]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !applicationId) return;
    try {
      setSubmitting(true);
      setError(null);

      if (!user) {
        setError("Not authenticated");
        return;
      }

      const profile =
        userProfile ??
        (await (async () => {
          const { data, error } = await supabase
            .from("users")
            .select("id, first_name, last_name, role")
            .eq("id", user.id)
            .single();
          if (error) throw error;
          return data;
        })());

      const { data, error } = await supabase
        .from('reviews')
        .insert([{
          application_id: applicationId,
          reviewer_id: user.id,
          review_stage: 'internal',
          overall_comments: newComment,
          status: 'completed'
        }])
        .select()
        .single();
      if (error) throw error;
      const newCommentObj: Comment = {
        id: data.id,
        author: `${profile.first_name} ${profile.last_name}`.trim() || "Unknown User",
        role: profile.role || 'reviewer',
        avatar: `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase() || "UU",
        content: newComment,
        timestamp: "Just now",
        created_at: new Date().toISOString(),
        authorId: user.id,
        editable: true,
      };
      setComments((prev) => [newCommentObj, ...prev]);
      setNewComment("");
    } catch (err) {
      console.error("❌ [ApplicationComments] Error adding comment:", err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (comment: Comment) => {
    setError(null);
    setEditingId(comment.id);
    setEditingText(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async (comment: Comment) => {
    if (!user) {
      setError("Not authenticated");
      return;
    }
    const nextText = editingText.trim();
    if (!nextText) return;

    try {
      setRowBusyId(comment.id);
      setError(null);

      const { data, error } = await supabase
        .from("reviews")
        .update({ overall_comments: nextText })
        .eq("id", comment.id)
        .eq("reviewer_id", user.id)
        .eq("review_stage", "internal")
        .select("id, overall_comments, updated_at, created_at")
        .single();
      if (error) throw error;

      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                content: data.overall_comments ?? nextText,
                timestamp: new Date(data.updated_at ?? data.created_at ?? new Date().toISOString()).toLocaleString(),
              }
            : c
        )
      );
      cancelEdit();
    } catch (e) {
      console.error("❌ [ApplicationComments] Failed to edit comment:", e);
      setError("Failed to edit comment");
    } finally {
      setRowBusyId(null);
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (!user) {
      setError("Not authenticated");
      return;
    }
    try {
      setRowBusyId(comment.id);
      setError(null);
      const { error } = await supabase
        .from("reviews")
        .delete()
        .eq("id", comment.id)
        .eq("reviewer_id", user.id)
        .eq("review_stage", "internal");
      if (error) throw error;

      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      if (editingId === comment.id) cancelEdit();
    } catch (e) {
      console.error("❌ [ApplicationComments] Failed to delete comment:", e);
      setError("Failed to delete comment");
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal Notes & History</CardTitle>
        <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
          Comments are visible to all RWB staff
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="w-fit justify-start">
            <TabsTrigger value="timeline" className="flex-none px-4">
              Timeline
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-none px-4">
              Internal notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Timestamp timeline</h3>
              </div>

              {eventsError ? <p className="text-sm text-red-600">{eventsError}</p> : null}
              {eventsLoading ? (
                <div className="text-center py-6 text-muted-foreground">Loading timeline...</div>
              ) : events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((evt, idx) => (
                    <div key={evt.id} className="relative flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {evt.avatar}
                        </div>
                        {idx < events.length - 1 ? <div className="w-px flex-1 bg-border mt-2" /> : null}
                      </div>

                      <div className="flex-1 pb-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{evt.actorName}</span>
                          <Badge variant="outline" className="text-xs">
                            {evt.actorRole}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(evt.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="secondary" className="text-xs">
                            {humanizeStatus(evt.fromStatus)}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="default" className="text-xs">
                            {humanizeStatus(evt.toStatus)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">({evt.action})</span>
                        </div>

                        {evt.comment ? (
                          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{evt.comment}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No workflow events yet.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <div className="space-y-6">
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading comments...</div>
              ) : comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-4">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{comment.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{comment.author}</span>
                        <Badge variant="outline" className="text-xs">
                          {comment.role}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
                        {user?.id && comment.authorId === user.id && comment.editable && (
                          <div className="ml-auto flex items-center gap-2">
                            {editingId === comment.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={rowBusyId === comment.id || !editingText.trim()}
                                  onClick={() => saveEdit(comment)}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={rowBusyId === comment.id}
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={rowBusyId === comment.id}
                                  onClick={() => startEdit(comment)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={rowBusyId === comment.id}
                                  onClick={() => deleteComment(comment)}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {editingId === comment.id ? (
                        <Textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="min-h-[90px]"
                          disabled={rowBusyId === comment.id}
                        />
                      ) : (
                        <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-sm leading-6">
                          {comment.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No comments yet</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="pt-6">
        <div className="w-full space-y-4">
          <Separator />
          <div className="space-y-3">
            <Label htmlFor="new-note" className="text-sm font-medium">Add a new note</Label>
            <Textarea
              id="new-note"
              placeholder="Type your internal note here..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end">
            <Button 
              onClick={handleAddComment}
              disabled={!newComment.trim() || submitting}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Post Note
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
} 