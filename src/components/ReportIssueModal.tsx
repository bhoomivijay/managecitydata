import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Send, Sparkles, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addIncident, updateIncidentWithAI, isUserSuspended, isUserInWarningZone } from "@/lib/firebase-services";
import { useAuth } from "@/contexts/AuthContext";

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation?: {lat: number, lng: number} | null;
  onIncidentAdded?: (incidentId: string) => void; // Callback when incident is added
}

export const ReportIssueModal = ({ isOpen, onClose, selectedLocation, onIncidentAdded }: ReportIssueModalProps) => {
  const [description, setDescription] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [severity, setSeverity] = useState<number | undefined>(undefined);
  const [category, setCategory] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [isInWarningZone, setIsInWarningZone] = useState(false);
  
  // Debug: Track description changes
  useEffect(() => {
    console.log('ReportIssueModal: Description state changed to:', description);
    console.log('ReportIssueModal: Description type:', typeof description);
    console.log('ReportIssueModal: Description length:', description?.length);
  }, [description]);
  const { toast } = useToast();
  const { userData } = useAuth();

  // Debug: Check if user is authenticated
  useEffect(() => {
    console.log('ReportIssueModal mounted');
    console.log('Selected location:', selectedLocation);
    console.log('User data:', userData);
    console.log('User authenticated:', !!userData?.uid);
  }, [selectedLocation, userData]);

  // Check if user is suspended or in warning zone
  useEffect(() => {
    const checkUserStatus = async () => {
      if (userData?.uid) {
        const suspended = await isUserSuspended(userData.uid);
        const inWarningZone = await isUserInWarningZone(userData.uid);
        
        setIsSuspended(suspended);
        setIsInWarningZone(inWarningZone);
        
        console.log('User suspension status:', suspended);
        console.log('User warning zone status:', inWarningZone);
      }
    };
    
    checkUserStatus();
  }, [userData?.uid]);

  // Gemini API configuration
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";
  


  const analyzeIssue = async () => {
    console.log('ReportIssueModal: ===== AI ANALYSIS CALLED =====');
    console.log('ReportIssueModal: Description value:', description);
    console.log('ReportIssueModal: Description type:', typeof description);
    console.log('ReportIssueModal: Description length:', description?.length);
    console.log('ReportIssueModal: Description trimmed:', description?.trim());
    console.log('ReportIssueModal: Description state at time of analysis:', description);
    
    if (!description || !description.trim()) {
      console.error('ReportIssueModal: Description is empty or undefined!');
      console.error('ReportIssueModal: Description state:', description);
      toast({
        title: "Description Error",
        description: "Description is empty or undefined. Please try typing again.",
        variant: "destructive"
      });
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      // Double-check the description before creating the prompt
      console.log('ReportIssueModal: Creating prompt with description:', description);
      console.log('ReportIssueModal: Description type in prompt:', typeof description);
      console.log('ReportIssueModal: Description length in prompt:', description?.length);
      
      if (!description || description.trim().length === 0) {
        throw new Error('Description is empty or undefined when creating prompt');
      }
      
      const prompt = `You are PulseAI, a city management assistant. Analyze the following citizen report: "${description}". 

Please provide a brief analysis in strict JSON format with no extra text, comments, or markdown ticks before or after the JSON object.

The JSON must have:
- "summary": A brief, 1-2 sentence summary of the issue (keep it short and clear)
- "category": One of these exact values: 'Traffic', 'Power Outage', 'Water Issue', 'Public Unrest', 'Infrastructure', 'Other'
- "severity": A number from 1-5 where 1=Low, 2=Medium, 3=High, 4=Critical, 5=Emergency

Category mapping guidelines:
- 'Traffic': Road accidents, traffic jams, broken traffic lights, road closures, parking issues
- 'Power Outage': Electricity issues, street light problems, power failures, electrical hazards
- 'Water Issue': Water leaks, flooding, water quality problems, drainage issues, pipe bursts
- 'Public Unrest': Protests, disturbances, safety concerns, criminal activities, emergencies
- 'Infrastructure': Building damage, road damage, public facility issues, construction problems, tree/vegetation issues
- 'Other': Any issue not fitting the above categories

Example response format:
{ "summary": "Vehicle collision with tree requiring immediate cleanup and safety assessment", "category": "Infrastructure", "severity": 3 }

Keep the summary brief and to the point. Choose the most appropriate category based on the issue description.`;

      console.log('ReportIssueModal: Making API call to Gemini...');
      console.log('ReportIssueModal: API URL:', `${GEMINI_API_URL}?key=${GEMINI_API_KEY.substring(0, 10)}...`);
      console.log('ReportIssueModal: Prompt being sent:', prompt);
      
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      console.log('ReportIssueModal: API response status:', response.status);
      console.log('ReportIssueModal: API response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ReportIssueModal: API error response:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('ReportIssueModal: Full API response:', data);
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        console.error('ReportIssueModal: Invalid API response structure:', data);
        throw new Error('Invalid API response structure');
      }
      
      const aiResponseText = data.candidates[0].content.parts[0].text;
      
      // Clean up the response to ensure it's valid JSON
      const cleanedResponse = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
      console.log('ReportIssueModal: AI response text:', aiResponseText);
      console.log('ReportIssueModal: Cleaned response:', cleanedResponse);
      
      let aiData;
      try {
        aiData = JSON.parse(cleanedResponse);
        console.log('ReportIssueModal: Successfully parsed JSON:', aiData);
      } catch (parseError) {
        console.error('ReportIssueModal: JSON parsing failed:', parseError);
        console.error('ReportIssueModal: Raw response that failed to parse:', aiResponseText);
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
      
      console.log('ReportIssueModal: Raw AI response:', aiResponseText);
      console.log('ReportIssueModal: Cleaned AI response:', cleanedResponse);
      console.log('ReportIssueModal: Parsed AI data:', aiData);
      console.log('ReportIssueModal: AI severity type:', typeof aiData.severity);
      console.log('ReportIssueModal: AI severity value:', aiData.severity);
      
      setAiSummary(aiData.summary);
      setSeverity(Number(aiData.severity)); // Ensure severity is a number
      setCategory(aiData.category);
      
      // Store the category for later use
      localStorage.setItem('current_ai_category', aiData.category);
      
      toast({
        title: "AI Analysis Complete",
        description: `Issue analyzed: ${aiData.category} - Severity ${aiData.severity}`,
      });
      
    } catch (error) {
      console.error('Error analyzing with AI:', error);
      toast({
        title: "AI Analysis Failed",
        description: "Failed to analyze the issue. Please try again.",
        variant: "destructive"
      });
      
      // Fallback to basic analysis
      setAiSummary("Analysis failed - manual review required");
      setSeverity(3); // Use medium severity as fallback, not 1
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    // Check if user is suspended based on score
    if (isSuspended) {
      toast({
        title: "Account Suspended",
        description: "Your account has been suspended due to low score (below -80). You cannot submit reports until your score improves.",
        variant: "destructive"
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Description Required",
        description: "Please provide a description of the issue.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedLocation) {
      toast({
        title: "Location Required",
        description: "Please select a location on the map first.",
        variant: "destructive"
      });
      return;
    }

      if (!aiSummary || !category || !severity || severity < 1 || severity > 5) {
        console.log('ReportIssueModal: Missing or invalid AI analysis data:', { aiSummary, category, severity });
        toast({
          title: "AI Analysis Required",
          description: "Please analyze the issue with AI before submitting. The AI must determine a valid severity level (1-5).",
          variant: "destructive"
        });
        return;
      }

    try {
      if (!userData?.uid) {
        throw new Error('User not authenticated. Please login again.');
      }
      
      // First, add the incident to Firebase
      const incidentData = {
        description: description,
        location: {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng
        }
      };

      let incidentId: string;
      try {
        // Create incident with AI analysis - no fallbacks to override AI determination
        const aiAnalysis = {
          summary: aiSummary || 'Manual review required',
          category: category || 'Other',
          severity: severity // Use AI-determined severity without fallback
        };
        
        console.log('ReportIssueModal: ===== SUBMITTING INCIDENT =====');
        console.log('ReportIssueModal: AI Analysis object being passed:', aiAnalysis);
        console.log('ReportIssueModal: AI Analysis severity:', aiAnalysis.severity);
        console.log('ReportIssueModal: AI Analysis severity type:', typeof aiAnalysis.severity);
        console.log('ReportIssueModal: Current state - aiSummary:', aiSummary, 'category:', category, 'severity:', severity);
        console.log('ReportIssueModal: ===============================');
        
        // Test: Check if the data is correct before sending
        if (aiAnalysis.severity !== severity) {
          console.error('ReportIssueModal: SEVERITY MISMATCH!');
          console.error('ReportIssueModal: aiAnalysis.severity:', aiAnalysis.severity);
          console.error('ReportIssueModal: state severity:', severity);
        }
        
        incidentId = await addIncident(incidentData, aiAnalysis, userData);
        console.log('Incident created with ID:', incidentId);
      } catch (addError) {
        console.error('Error in addIncident:', addError);
        throw new Error(`Failed to add incident: ${addError.message}`);
      }
      
      toast({
        title: "Report Submitted Successfully!",
        description: `Issue reported and saved to database. ID: ${incidentId}`,
      });
      
      // Notify parent component that incident was added
      if (onIncidentAdded) {
        onIncidentAdded(incidentId);
      }
      
      // Reset form
      setDescription("");
      setAiSummary("");
      setSeverity(undefined); // Reset to undefined, not 1
      setCategory("");
      
      console.log('ReportIssueModal: Closing modal after successful submission');
      
      // Close modal immediately
      onClose();
      
      // Don't refresh the page - let the parent component handle updates
      // The incidents list should update automatically via real-time listeners
    } catch (error) {
      console.error('Error saving incident:', error);
      toast({
        title: "Submission Failed",
        description: `Failed to save the incident to database: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const getSeverityColor = (level: number) => {
    const colors = {
      1: "severity-1",
      2: "severity-2",
      3: "severity-3", 
      4: "severity-4",
      5: "severity-5"
    };
    return colors[level as keyof typeof colors];
  };

  const getSeverityLabel = (level: number) => {
    const labels = {
      1: "Low",
      2: "Medium",
      3: "High", 
      4: "Critical",
      5: "Emergency"
    };
    return labels[level as keyof typeof labels];
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="card-city max-w-md animate-slide-up z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <span>Report City Issue</span>
          </DialogTitle>
          <DialogDescription>
            Describe the issue you've encountered and our AI will analyze its severity.
          </DialogDescription>
        </DialogHeader>
        
        {/* Manual close button for debugging */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl font-bold"
          type="button"
        >
          ×
        </button>

        <form onSubmit={(e) => {
          e.preventDefault();
          console.log('ReportIssueModal: Form submitted via form element');
          handleSubmit();
        }} className="space-y-4 relative z-30">
          {/* Location Display */}
          {selectedLocation && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <MapPin className="h-4 w-4" />
              <span>Location: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}</span>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Issue Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the issue you've encountered (e.g., pothole, broken streetlight, garbage overflow...)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={(e) => console.log('Description textarea focused')}
              onClick={(e) => console.log('Description textarea clicked')}
              className="bg-muted/50 border-border/50 min-h-[100px] relative z-20 cursor-text"
              rows={4}
            />
          </div>

          {/* AI Analysis Button */}
          <Button 
            type="button"
            onClick={(e) => {
              console.log('Analyze button clicked');
              analyzeIssue();
            }}
            disabled={!description.trim() || isAnalyzing}
            className="w-full bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 relative z-30"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isAnalyzing ? "Analyzing..." : "Analyze with AI"}
          </Button>
          


          {/* AI Summary */}
          {aiSummary && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AI Analysis</span>
              </div>
              
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Summary</Label>
                  <p className="text-sm">{aiSummary}</p>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Badge variant="outline" className="text-xs mt-1">
                    {category}
                  </Badge>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Severity Level</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge className={`${getSeverityColor(severity)} text-white`}>
                      Level {severity}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {getSeverityLabel(severity)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warning Zone Alert */}
          {isInWarningZone && !isSuspended && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-center space-x-2 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Warning Zone</span>
              </div>
              <p className="text-xs text-yellow-500 mt-1">
                Your score is negative. Improve your score to avoid suspension. Score below -80 will result in account suspension.
              </p>
            </div>
          )}

          {/* Suspension Warning */}
          {isSuspended && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Account Suspended</span>
              </div>
              <p className="text-xs text-red-500 mt-1">
                Your account has been suspended due to low score (below -80). You cannot submit reports until your score improves.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex space-x-2 pt-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={(e) => {
                console.log('Cancel button clicked');
                onClose();
              }} 
              className="flex-1 bg-muted/50 border-border/50 relative z-30"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              className="flex-1 btn-city btn-glow relative z-30"
              disabled={!description.trim() || !aiSummary || !category || !severity || isSuspended}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSuspended ? 'Account Suspended' : 'Submit Report'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};