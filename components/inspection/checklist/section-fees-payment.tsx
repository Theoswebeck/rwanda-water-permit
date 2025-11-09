/**
 * Section 8: Fees Payment Verification
 * Hybrid section showing payment records and inspector verification
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, CheckCircle, XCircle } from "lucide-react";
import { formatDate } from "@/lib/inspection-utils";

interface FeesPaymentSectionProps {
  data: {
    feesPaymentVerified?: boolean;
    feesPaymentAmount?: number;
    feesPaymentProof?: string;
    feesOutstandingAmount?: number;
  };
  paymentHistory?: Array<{
    amount: number;
    status: string;
    payment_date: string;
    reference: string;
  }>;
  totalPaymentAmount?: number;
  lastPaymentDate?: string;
  paymentStatus?: string;
  onChange: (field: string, value: any) => void;
}

export function FeesPaymentSection({ 
  data, 
  paymentHistory, 
  totalPaymentAmount,
  lastPaymentDate,
  paymentStatus,
  onChange 
}: FeesPaymentSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Section 8: Fees Payment (Yes/No) *
        </CardTitle>
        <CardDescription>
          Verification of permit fee payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment records from system */}
        {paymentHistory && paymentHistory.length > 0 && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">💳 Payment Records (From System)</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-800">Total Amount Paid:</span>
                <span className="font-semibold text-blue-900">
                  {totalPaymentAmount?.toLocaleString()} RWF
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-800">Last Payment:</span>
                <span className="font-semibold text-blue-900">
                  {lastPaymentDate ? formatDate(lastPaymentDate) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-800">Status:</span>
                <Badge variant={paymentStatus === 'Paid' ? 'default' : 'secondary'}>
                  {paymentStatus}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Inspector verification */}
        <div>
          <Label htmlFor="payment-verified">Inspector Verification *</Label>
          <Select 
            value={data.feesPaymentVerified === true ? 'paid' : data.feesPaymentVerified === false ? 'not_paid' : ''} 
            onValueChange={(value) => onChange('feesPaymentVerified', value === 'paid')}
          >
            <SelectTrigger id="payment-verified">
              <SelectValue placeholder="Verify payment status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>✅ Paid - Proof Verified</span>
                </div>
              </SelectItem>
              <SelectItem value="not_paid">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span>❌ Not Paid / Incomplete</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* If paid */}
        {data.feesPaymentVerified === true && (
          <>
            <div>
              <Label htmlFor="payment-amount">Amount Paid (RWF)</Label>
              <Input
                id="payment-amount"
                type="number"
                placeholder="Enter amount verified"
                value={data.feesPaymentAmount || ''}
                onChange={(e) => onChange('feesPaymentAmount', parseFloat(e.target.value) || undefined)}
              />
            </div>
            <div>
              <Label htmlFor="payment-proof">Proof Details</Label>
              <Textarea
                id="payment-proof"
                placeholder="Receipt number, transaction reference, or other proof details..."
                value={data.feesPaymentProof || ''}
                onChange={(e) => onChange('feesPaymentProof', e.target.value)}
                rows={2}
              />
            </div>
          </>
        )}

        {/* If not paid */}
        {data.feesPaymentVerified === false && (
          <div>
            <Label htmlFor="outstanding-amount">Amount Not Paid / Outstanding (RWF)</Label>
            <Input
              id="outstanding-amount"
              type="number"
              placeholder="Enter outstanding amount"
              value={data.feesOutstandingAmount || ''}
              onChange={(e) => onChange('feesOutstandingAmount', parseFloat(e.target.value) || undefined)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}


