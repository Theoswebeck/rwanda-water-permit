"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send, Loader2 } from "lucide-react";
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
  source: "review" | "approval";
  editable: boolean;
}

interface ApproverCommentsProps {
  applicationId?: string;
  applicationNumber?: string;
}

interface Reviewer {
  first_name: string;
  last_name: string;
  role: string;
}

interface Approver {
  first_name: string;
  last_name: string;
  role: string;
}

export function ApproverComments({ applicationId, applicationNumber }: ApproverCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, userProfile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!applicationId) return;
    
    try {
      setLoading(true);
      setError(null);

      // Fetch comments from reviews table and approvals table
      const [reviewsResponse, approvalsResponse] = await Promise.all([
        supabase
          .from('reviews')
          .select(`
            *,
            reviewer:users!reviewer_id(first_name, last_name, role)
          `)
          .eq('application_id', applicationId)
          .order('created_at', { ascending: false }),
        
        supabase
          .from('approvals')
          .select(`
            *,
            approver:users!approver_id(first_name, last_name, role)
          `)
          .eq('application_id', applicationId)
          .order('created_at', { ascending: false })
      ]);

      const allComments: Comment[] = [];

      // Process reviews
      if (reviewsResponse.data) {
        reviewsResponse.data.forEach(review => {
          const reviewer = review.reviewer as Reviewer | null;
          const name = reviewer ? `${reviewer.first_name} ${reviewer.last_name}` : 'Unknown Reviewer';
          const initials = reviewer ? `${reviewer.first_name?.[0] || ''}${reviewer.last_name?.[0] || ''}`.toUpperCase() : 'UR';
          
          if (review.overall_comments || review.technical_review) {
            allComments.push({
              id: review.id,
              author: name,
              role: 'reviewer',
              avatar: initials,
              content: review.overall_comments || review.technical_review || 'No comments',
              timestamp: new Date(review.created_at).toLocaleString(),
              created_at: review.created_at,
              authorId: review.reviewer_id ?? null,
              source: "review",
              editable: false,
            });
          }
        });
      }

      // Process approvals
      if (approvalsResponse.data) {
        approvalsResponse.data.forEach(approval => {
          const approver = approval.approver as Approver | null;
          const name = approver ? `${approver.first_name} ${approver.last_name}` : 'Unknown Approver';
          const initials = approver ? `${approver.first_name?.[0] || ''}${approver.last_name?.[0] || ''}`.toUpperCase() : 'UA';
          
          if (approval.decision_reason) {
            const isComment = approval.decision === "comment";
            allComments.push({
              id: approval.id,
              author: name,
              role: 'approver',
              avatar: initials,
              content: `${approval.decision.toUpperCase()}: ${approval.decision_reason}`,
              timestamp: new Date(approval.created_at).toLocaleString(),
              created_at: approval.created_at,
              authorId: approval.approver_id ?? null,
              source: "approval",
              editable: isComment,
            });
          }
        });
      }

      // Sort all comments by date (newest first)
      allComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setComments(allComments);

    } catch (err) {
      console.error('Error fetching comments:', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (applicationId) {
      fetchComments();
    }
  }, [applicationId, fetchComments]);

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

      // Add comment to approvals table
      const { data, error } = await supabase
        .from('approvals')
        .insert([{
          application_id: applicationId,
          approver_id: user.id,
          decision: 'comment',
          decision_reason: newComment
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to local comments
      const newCommentObj: Comment = {
        id: data.id,
        author: `${profile.first_name} ${profile.last_name}`.trim() || "Unknown User",
        role: "approver",
        avatar: `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase() || "UU",
        content: `COMMENT: ${newComment}`,
        timestamp: "Just now",
        created_at: new Date().toISOString(),
        authorId: user.id,
        source: "approval",
        editable: true,
      };
      setComments((prev) => [newCommentObj, ...prev]);
      setNewComment("");
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (comment: Comment) => {
    setError(null);
    setEditingId(comment.id);
    // Stored as "COMMENT: ..." - edit only the note part.
    const prefix = "COMMENT:";
    const raw = comment.content.startsWith(prefix) ? comment.content.slice(prefix.length) : comment.content;
    setEditingText(raw.trim());
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
        .from("approvals")
        .update({ decision_reason: nextText })
        .eq("id", comment.id)
        .eq("approver_id", user.id)
        .eq("decision", "comment")
        .select("id, decision, decision_reason, updated_at, created_at")
        .single();
      if (error) throw error;

      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                content: `${String(data.decision).toUpperCase()}: ${data.decision_reason ?? nextText}`,
                timestamp: new Date(data.updated_at ?? data.created_at ?? new Date().toISOString()).toLocaleString(),
              }
            : c
        )
      );
      cancelEdit();
    } catch (e) {
      console.error("❌ [ApproverComments] Failed to edit comment:", e);
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
        .from("approvals")
        .delete()
        .eq("id", comment.id)
        .eq("approver_id", user.id)
        .eq("decision", "comment");
      if (error) throw error;

      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      if (editingId === comment.id) cancelEdit();
    } catch (e) {
      console.error("❌ [ApproverComments] Failed to delete comment:", e);
      setError("Failed to delete comment");
    } finally {
      setRowBusyId(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'approver':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'reviewer':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'inspector':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments & Decision History</CardTitle>
        <CardDescription>
          Internal communications and decision records for {applicationNumber || 'this application'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}
        
        {/* Comments Display */}
        <div className="space-y-6">
          {comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-4">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{comment.avatar}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{comment.author}</span>
                    <Badge variant="outline" className={`text-xs ${getRoleBadgeColor(comment.role)}`}>
                      {comment.role.charAt(0).toUpperCase() + comment.role.slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
                    {user?.id && comment.authorId === user.id && comment.source === "approval" && comment.editable && (
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
                    <p className="text-sm leading-6 text-muted-foreground">
                      {comment.content}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No comments or decisions yet</p>
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="pt-6">
        <div className="w-full space-y-4">
          <Separator />
          <div className="space-y-3">
            <Label htmlFor="new-comment" className="text-sm font-medium">Add Executive Note</Label>
            <Textarea
              id="new-comment"
              placeholder="Add your executive note or comment here..."
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
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post Note
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
} 