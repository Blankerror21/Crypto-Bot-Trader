import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Clock, Trash2, Brain, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Prediction {
  id: number;
  userId: string;
  symbol: string;
  predictedDirection: "up" | "down";
  confidence: number;
  priceAtPrediction: string;
  priceAtCheck: string | null;
  actualDirection: "up" | "down" | "flat" | null;
  wasCorrect: boolean | null;
  priceChangePercent: string | null;
  predictionTimestamp: string;
  checkedAt: string | null;
  checkIntervalMinutes: number | null;
}

function formatTimeWindow(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

interface AccuracyStats {
  total: number;
  correct: number;
  accuracy: number;
  bySymbol: Record<string, { total: number; correct: number }>;
  byConfidence: {
    low: { total: number; correct: number };
    medium: { total: number; correct: number };
    high: { total: number; correct: number };
  };
}

interface MLStats {
  isTrained: boolean;
  accuracy: number;
  sampleCount: number;
  trainedAt: string | null;
  featureImportance: Array<{ feature: string; importance: number }>;
  availablePredictions: number;
  readyToTrain: boolean;
}

function DirectionIcon({ direction }: { direction: "up" | "down" | "flat" | null }) {
  if (direction === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (direction === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  if (direction === "flat") return <Minus className="w-4 h-4 text-muted-foreground" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

function AccuracyBadge({ accuracy }: { accuracy: number }) {
  const color = accuracy >= 60 ? "bg-green-500/10 text-green-500 border-green-500/20" :
                accuracy >= 40 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                "bg-red-500/10 text-red-500 border-red-500/20";
  return (
    <Badge variant="outline" className={color}>
      {accuracy.toFixed(1)}%
    </Badge>
  );
}

export default function AIAccuracyPage() {
  const { toast } = useToast();
  const [isClearing, setIsClearing] = useState(false);

  const { data: predictions, isLoading: loadingPredictions } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions"],
    refetchInterval: 30000,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<AccuracyStats>({
    queryKey: ["/api/predictions/stats"],
    refetchInterval: 30000,
  });

  const { data: mlStats, isLoading: loadingMLStats } = useQuery<MLStats>({
    queryKey: ["/api/ml/stats"],
    refetchInterval: 60000,
  });

  const trainMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ml/train");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "ML Model Trained",
          description: `Model trained on ${data.sampleCount} samples with ${data.accuracy.toFixed(1)}% accuracy`,
        });
      } else {
        toast({
          title: "Training Not Ready",
          description: data.message || "Need more data to train the model",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ml/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to train ML model",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/predictions");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Data Cleared",
        description: `Removed ${data.deletedCount} predictions. Start fresh!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/stats"] });
      setIsClearing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear prediction data",
        variant: "destructive",
      });
      setIsClearing(false);
    },
  });

  const checkedPredictions = predictions?.filter(p => p.wasCorrect !== null) || [];
  const pendingPredictions = predictions?.filter(p => p.wasCorrect === null) || [];

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <Target className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">AI Prediction Accuracy</h1>
              <p className="text-muted-foreground">Track how well the AI predicts market direction</p>
            </div>
          </div>
          
          <AlertDialog open={isClearing} onOpenChange={setIsClearing}>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                data-testid="button-clear-predictions"
                disabled={!predictions || predictions.length === 0}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Prediction Data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {predictions?.length || 0} prediction records. 
                  You'll start fresh with the new dynamic timeframe tracking.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  data-testid="button-confirm-clear"
                >
                  {clearMutation.isPending ? "Clearing..." : "Clear All Data"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {loadingStats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-overall-accuracy">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Overall Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{(stats?.accuracy ?? 0).toFixed(1)}%</span>
                  <span className="text-sm text-muted-foreground">
                    ({stats?.correct ?? 0}/{stats?.total ?? 0} correct)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-predictions">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Predictions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{stats.total}</span>
                  <span className="text-sm text-muted-foreground">
                    checked
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-pending-predictions">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Check</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{pendingPredictions.length}</span>
                  <span className="text-sm text-muted-foreground">
                    awaiting outcome
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {stats && stats.bySymbol && Object.keys(stats.bySymbol).length > 0 && (
          <Card data-testid="card-accuracy-by-coin">
            <CardHeader>
              <CardTitle className="text-lg">Accuracy by Coin</CardTitle>
              <CardDescription>How well the AI predicts each cryptocurrency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(stats.bySymbol)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([symbol, data]) => {
                    const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                    return (
                      <div 
                        key={symbol} 
                        className="p-3 rounded-lg bg-muted/50 border border-border"
                        data-testid={`stat-coin-${symbol}`}
                      >
                        <div className="font-medium text-sm">{symbol}</div>
                        <div className="flex items-center justify-between mt-1">
                          <AccuracyBadge accuracy={accuracy} />
                          <span className="text-xs text-muted-foreground">{data.total} pred</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {stats && (
            <Card data-testid="card-accuracy-by-confidence">
            <CardHeader>
              <CardTitle className="text-lg">Accuracy by Confidence Level</CardTitle>
              <CardDescription>Does higher confidence lead to better predictions?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Low (< 50%)", key: "low" as const },
                  { label: "Medium (50-75%)", key: "medium" as const },
                  { label: "High (75%+)", key: "high" as const },
                ].map(({ label, key }) => {
                  const data = stats?.byConfidence?.[key] ?? { total: 0, correct: 0 };
                  const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                  return (
                    <div 
                      key={key} 
                      className="p-4 rounded-lg bg-muted/50 border border-border text-center"
                      data-testid={`stat-confidence-${key}`}
                    >
                      <div className="font-medium">{label}</div>
                      <div className="text-2xl font-bold mt-1">{accuracy.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground mt-1">{data.total} predictions</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ML Learning Section */}
        <Card data-testid="card-ml-learning">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                Machine Learning Model
              </CardTitle>
              <CardDescription>
                Learn from prediction history to adjust confidence scores
              </CardDescription>
            </div>
            <Button
              onClick={() => trainMutation.mutate()}
              disabled={trainMutation.isPending || !mlStats?.readyToTrain}
              variant="outline"
              data-testid="button-train-ml"
            >
              {trainMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Force Retrain
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {loadingMLStats ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : mlStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="font-medium mt-1">
                      {mlStats.isTrained ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Not Trained</Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-xs text-muted-foreground">Training Accuracy</div>
                    <div className="font-medium text-lg mt-1">
                      {mlStats.isTrained ? `${mlStats.accuracy.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-xs text-muted-foreground">Training Samples</div>
                    <div className="font-medium text-lg mt-1">{mlStats.sampleCount}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-xs text-muted-foreground">Last Trained</div>
                    <div className="font-medium text-sm mt-1">
                      {mlStats.trainedAt 
                        ? formatDistanceToNow(new Date(mlStats.trainedAt), { addSuffix: true })
                        : 'Never'}
                    </div>
                  </div>
                </div>
                
                {mlStats.isTrained && (
                  <div className="text-xs text-muted-foreground p-2 rounded bg-green-500/10 border border-green-500/20 mb-4">
                    Continuous Learning Active - Model retrains automatically every 5 minutes with new data
                  </div>
                )}
                
                {mlStats.isTrained && mlStats.featureImportance.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Feature Importance</div>
                    <div className="space-y-2">
                      {mlStats.featureImportance.map(({ feature, importance }) => (
                        <div key={feature} className="flex items-center gap-3">
                          <div className="w-24 text-xs text-muted-foreground capitalize">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${importance * 100}%` }}
                            />
                          </div>
                          <div className="w-12 text-xs text-right">
                            {(importance * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!mlStats.isTrained && (
                  <div className="text-sm text-muted-foreground p-4 rounded-lg bg-muted/30 border border-border">
                    {mlStats.readyToTrain ? (
                      <>
                        <p className="font-medium mb-1 text-green-500">Continuous Learning Enabled - {mlStats.availablePredictions.toLocaleString()} predictions available</p>
                        <p>The ML model will automatically train and retrain as new predictions are checked. 
                        Training happens every 5 minutes when at least 10 new predictions are verified.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium mb-1">Need {20 - mlStats.availablePredictions} more checked predictions (have {mlStats.availablePredictions}/20)</p>
                        <p>The ML model learns from your prediction history to identify which factors lead to accurate predictions. 
                        Once you have 20+ checked predictions, continuous learning will activate automatically.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>ML stats unavailable</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-predictions">
          <CardHeader>
            <CardTitle className="text-lg">Recent Predictions</CardTitle>
            <CardDescription>Latest AI trading decisions and their outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPredictions ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : predictions && predictions.length > 0 ? (
              <div className="space-y-2">
                {predictions.slice(0, 50).map(prediction => (
                  <div 
                    key={prediction.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                    data-testid={`prediction-${prediction.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <DirectionIcon direction={prediction.predictedDirection} />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {prediction.symbol}
                          <Badge variant="outline" className="text-xs">
                            {prediction.confidence}% conf
                          </Badge>
                          {prediction.checkIntervalMinutes && (
                            <Badge variant="secondary" className="text-xs">
                              {formatTimeWindow(prediction.checkIntervalMinutes)} window
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Predicted {prediction.predictedDirection.toUpperCase()} @ ${Number(prediction.priceAtPrediction).toFixed(4)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-4">
                      {prediction.wasCorrect !== null ? (
                        <>
                          <div>
                            <div className="flex items-center gap-1 justify-end">
                              <DirectionIcon direction={prediction.actualDirection} />
                              <span className="text-sm">
                                {prediction.actualDirection?.toUpperCase()} 
                                <span className={Number(prediction.priceChangePercent) >= 0 ? "text-green-500" : "text-red-500"}>
                                  {" "}({Number(prediction.priceChangePercent) >= 0 ? "+" : ""}{Number(prediction.priceChangePercent).toFixed(2)}%)
                                </span>
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(prediction.predictionTimestamp), { addSuffix: true })}
                            </div>
                          </div>
                          {prediction.wasCorrect ? (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-500" />
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-end gap-1 text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm">Pending...</span>
                          </div>
                          {prediction.checkIntervalMinutes && (
                            <span className="text-xs">
                              Checking in {formatTimeWindow(prediction.checkIntervalMinutes)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No predictions yet</p>
                <p className="text-sm mt-1">AI predictions will appear here when the bot makes trading decisions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
