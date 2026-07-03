import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpCircle, Volume2, Palette, Combine, Lightbulb, FileText, Pencil, Check, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Combination {
  id: string;
  tone: string;
  style: string;
  icon: string;
  result: string;
  result_myanmar: string | null;
  use_case: string;
  use_case_myanmar: string | null;
  example: string | null;
  full_example: string | null;
  display_order: number;
  is_active: boolean;
}

const toneGuides = [
  {
    name: "Professional",
    nameMyanmar: "ကျွမ်းကျင်",
    icon: "💼",
    description: "Authoritative, polished, and expert tone for business content",
    descriptionMyanmar: "အာဏာပိုင်၊ ကျွမ်းကျင်၊ ပညာရှင်ဆန်တဲ့ လေသံ",
    framework: [
      "Use industry terminology appropriately",
      "Cite data and research when relevant",
      "Maintain expertise while being accessible"
    ],
    example: "Our comprehensive analysis indicates a 40% increase in engagement when implementing these strategies...",
    bestWith: ["Article", "Tutorial", "News"]
  },
  {
    name: "Casual",
    nameMyanmar: "သာမန်",
    icon: "☕",
    description: "Relaxed, conversational tone like chatting with a friend",
    descriptionMyanmar: "သူငယ်ချင်းနဲ့ စကားပြောသလို သာမန်လေသံ",
    framework: [
      "Use contractions (I'm, you're, we'll)",
      "Include personal anecdotes",
      "Keep sentences short and punchy"
    ],
    example: "So here's the thing - I've been doing this for years and trust me, it works...",
    bestWith: ["Blog Post", "Script", "Social Media"]
  },
  {
    name: "Friendly",
    nameMyanmar: "ဖော်ရွေ",
    icon: "😊",
    description: "Warm, approachable tone that builds connection",
    descriptionMyanmar: "နွေးထွေးပြီး ချဉ်းကပ်လွယ်တဲ့ ဖော်ရွေသော လေသံ",
    framework: [
      "Use inclusive language (we, us, together)",
      "Show empathy and understanding",
      "Encourage and motivate readers"
    ],
    example: "We've all been there, right? Don't worry - I'm here to help you figure this out together...",
    bestWith: ["Blog Post", "Tutorial", "Email"]
  },
  {
    name: "Formal",
    nameMyanmar: "တရားဝင်",
    icon: "🎩",
    description: "Structured, respectful tone for official communications",
    descriptionMyanmar: "တရားဝင်ဆက်သွယ်ရေးအတွက် စနစ်တကျ လေးစားဖွယ် လေသံ",
    framework: [
      "Avoid contractions and slang",
      "Use complete sentences with proper structure",
      "Maintain objectivity and neutrality"
    ],
    example: "It is imperative to acknowledge that the implementation of these protocols requires careful consideration...",
    bestWith: ["Article", "News", "Documentation"]
  },
  {
    name: "Inspiring",
    nameMyanmar: "စိတ်အားထက်သန်စေ",
    icon: "✨",
    description: "Motivational tone that encourages action and belief",
    descriptionMyanmar: "လုပ်ဆောင်ချင်စိတ်နဲ့ ယုံကြည်မှုကို အားပေးတဲ့ လေသံ",
    framework: [
      "Use powerful, emotive language",
      "Share success stories and possibilities",
      "End with strong calls to action"
    ],
    example: "Imagine waking up every day knowing you're living your purpose. That future starts with one decision today...",
    bestWith: ["Persuasive", "Blog Post", "Script"]
  },
  {
    name: "Tough Love",
    nameMyanmar: "ရိုးသားစွာ ထောက်ပြ",
    icon: "💥",
    description: "Brutally honest, confrontational tone that challenges readers",
    descriptionMyanmar: "ရိုးသားစွာ ရင်ဆိုင်ပြီး အမှန်တရားကို ထောက်ပြတဲ့ လေသံ",
    framework: [
      "1. Open with uncomfortable truth",
      "2. Amplify the pain of inaction",
      "3. Hold up the mirror",
      "4. Deliver wake-up call"
    ],
    example: "Stop pretending you don't know what to do. You know exactly what to do. You're just scared to do it.",
    bestWith: ["Persuasive", "Blog Post", "Script"]
  }
];

const styleGuides = [
  {
    name: "Blog Post",
    nameMyanmar: "ဘလော့ဂ် ပို့စ်",
    icon: "📝",
    description: "Engaging, SEO-friendly content with personal touch",
    structure: ["Hook intro", "Main points with examples", "Personal insights", "Conclusion + CTA"],
    outputFormat: "Conversational paragraphs, subheadings, bullet points",
    example: "Ever wondered why some people seem to effortlessly succeed while others struggle? Let me share what I've learned...",
    bestWith: ["Casual", "Friendly", "Tough Love"]
  },
  {
    name: "Article",
    nameMyanmar: "ဆောင်းပါး",
    icon: "📰",
    description: "In-depth, well-researched content for publications",
    structure: ["Lead paragraph", "Background context", "Main body with evidence", "Expert quotes", "Conclusion"],
    outputFormat: "Journalistic style, objective analysis, cited sources",
    example: "A recent study published in Nature reveals groundbreaking insights into the mechanisms of...",
    bestWith: ["Professional", "Formal"]
  },
  {
    name: "Tutorial",
    nameMyanmar: "သင်ခန်းစာ",
    icon: "📚",
    description: "Step-by-step instructional content",
    structure: ["Overview & objectives", "Prerequisites", "Numbered steps", "Tips & warnings", "Summary"],
    outputFormat: "Clear instructions, screenshots/examples, troubleshooting",
    example: "Step 1: First, navigate to the settings panel. You'll see a blue button labeled 'Configure'...",
    bestWith: ["Professional", "Casual", "Friendly"]
  },
  {
    name: "Persuasive",
    nameMyanmar: "ဆွဲဆောင်မှု",
    icon: "🎯",
    description: "Content designed to convince and convert",
    structure: ["Problem statement", "Agitate pain points", "Present solution", "Social proof", "Call to action"],
    outputFormat: "Emotional hooks, benefits-focused, urgency elements",
    example: "You've tried everything. The diets, the apps, the advice. Nothing worked. Until now...",
    bestWith: ["Tough Love", "Inspiring", "Casual"]
  },
  {
    name: "Script",
    nameMyanmar: "ဗီဒီယို စကားပြော",
    icon: "🎬",
    description: "Spoken content for videos or podcasts",
    structure: ["Hook (first 5 seconds)", "Intro & promise", "Main content", "Recap", "CTA & outro"],
    outputFormat: "Short sentences, natural speech patterns, verbal cues",
    example: "What if I told you... everything you know about productivity is wrong? Stay with me...",
    bestWith: ["Casual", "Inspiring", "Tough Love"]
  },
  {
    name: "News",
    nameMyanmar: "သတင်း",
    icon: "📢",
    description: "Timely, factual reporting on events",
    structure: ["Headline & lead", "5W1H (Who, What, When, Where, Why, How)", "Supporting details", "Background"],
    outputFormat: "Inverted pyramid, objective language, quotes",
    example: "Tech giant XYZ announced today the launch of their revolutionary AI platform, marking a significant shift in...",
    bestWith: ["Professional", "Formal"]
  }
];

// Example Dialog component for each combination
const ExampleDialog = ({ combo }: { combo: Combination }) => {
  if (!combo.full_example) return null;
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 text-[10px] gap-1 hover:bg-primary/10 text-primary"
        >
          <FileText className="h-3 w-3" />
          Example
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[700px] max-h-[80vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span>{combo.icon}</span>
            {combo.tone} + {combo.style} Example
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            ဒီ combination ကို အသုံးပြုပြီး ရေးထားတဲ့ နမူနာ content
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] px-4 py-2">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-primary/50">
            <ReactMarkdown>{combo.full_example}</ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Edit Dialog component for admins
const EditCombinationDialog = ({ combo, onSave }: { combo: Combination; onSave: () => void }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    tone: combo.tone,
    style: combo.style,
    icon: combo.icon,
    result: combo.result,
    result_myanmar: combo.result_myanmar || "",
    use_case: combo.use_case,
    use_case_myanmar: combo.use_case_myanmar || "",
    example: combo.example || "",
    full_example: combo.full_example || "",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("ai_content_combinations")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", combo.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Combination updated successfully!");
      setOpen(false);
      onSave();
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0 hover:bg-primary/10 text-muted-foreground hover:text-primary"
          title="Edit Combination"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit: {combo.tone} + {combo.style}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Combination ကို ပြင်ဆင်ရန်
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] px-4 py-4">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Icon</Label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Tone</Label>
                <Input
                  value={formData.tone}
                  onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Style</Label>
                <Input
                  value={formData.style}
                  onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Result (English)</Label>
              <Textarea
                value={formData.result}
                onChange={(e) => setFormData({ ...formData, result: e.target.value })}
                className="mt-1 min-h-[60px]"
              />
            </div>

            <div>
              <Label className="text-xs">Result (Myanmar / ဗမာ)</Label>
              <Textarea
                value={formData.result_myanmar}
                onChange={(e) => setFormData({ ...formData, result_myanmar: e.target.value })}
                className="mt-1 min-h-[60px]"
              />
            </div>

            <div>
              <Label className="text-xs">Use Case (English)</Label>
              <Textarea
                value={formData.use_case}
                onChange={(e) => setFormData({ ...formData, use_case: e.target.value })}
                className="mt-1 min-h-[60px]"
              />
            </div>

            <div>
              <Label className="text-xs">Use Case (Myanmar / ဗမာ)</Label>
              <Textarea
                value={formData.use_case_myanmar}
                onChange={(e) => setFormData({ ...formData, use_case_myanmar: e.target.value })}
                className="mt-1 min-h-[60px]"
              />
            </div>

            <div>
              <Label className="text-xs">Short Example</Label>
              <Textarea
                value={formData.example}
                onChange={(e) => setFormData({ ...formData, example: e.target.value })}
                className="mt-1 min-h-[60px]"
              />
            </div>

            <div>
              <Label className="text-xs">Full Example (Markdown)</Label>
              <Textarea
                value={formData.full_example}
                onChange={(e) => setFormData({ ...formData, full_example: e.target.value })}
                className="mt-1 min-h-[200px] font-mono text-xs"
                placeholder="# Title&#10;&#10;Content in markdown..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={() => updateMutation.mutate(formData)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export function AIContentWriterHelpDialog() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Fetch combinations from database
  const { data: combinations = [], isLoading } = useQuery({
    queryKey: ["ai-content-combinations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_content_combinations")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      return data as Combination[];
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-content-combinations"] });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10 h-8"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Guide</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[900px] max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border/50 bg-gradient-to-r from-primary/10 via-transparent to-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                AI Content Writer Guide
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Tone နှင့် Style ရွေးချယ်ခြင်း လမ်းညွှန်
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <Tabs defaultValue="combinations" className="flex-1">
          <div className="px-4 pt-2 border-b border-border/30">
            <TabsList className="grid w-full grid-cols-4 h-9 bg-muted/30">
              <TabsTrigger value="tones" className="text-xs gap-1.5 data-[state=active]:bg-primary/20">
                <Volume2 className="h-3 w-3" />
                Tones
              </TabsTrigger>
              <TabsTrigger value="styles" className="text-xs gap-1.5 data-[state=active]:bg-primary/20">
                <Palette className="h-3 w-3" />
                Styles
              </TabsTrigger>
              <TabsTrigger value="combinations" className="text-xs gap-1.5 data-[state=active]:bg-primary/20">
                <Combine className="h-3 w-3" />
                Combinations
              </TabsTrigger>
              <TabsTrigger value="tips" className="text-xs gap-1.5 data-[state=active]:bg-primary/20">
                <Lightbulb className="h-3 w-3" />
                Tips
              </TabsTrigger>
            </TabsList>
          </div>
          
          <ScrollArea className="h-[calc(85vh-140px)]">
            {/* Tones Tab */}
            <TabsContent value="tones" className="p-4 mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-4">
                Tone က သင့် content ရဲ့ စိတ်ခံစားမှု အရောင်အသွေးကို သတ်မှတ်ပေးပါတယ်။
              </p>
              <div className="grid gap-3">
                {toneGuides.map((tone) => (
                  <div
                    key={tone.name}
                    className="p-3 rounded-lg bg-card/50 border border-border/50 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{tone.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">{tone.name}</h4>
                          <span className="text-xs text-muted-foreground">({tone.nameMyanmar})</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{tone.description}</p>
                        <p className="text-[10px] text-muted-foreground/70">{tone.descriptionMyanmar}</p>
                        <div className="mt-2 space-y-1">
                          {tone.framework.map((item, i) => (
                            <p key={i} className="text-[10px] text-muted-foreground">• {item}</p>
                          ))}
                        </div>
                        <div className="mt-2 p-2 rounded bg-muted/30 text-[10px] italic text-muted-foreground">
                          "{tone.example}"
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-[9px] text-muted-foreground">Best with:</span>
                          {tone.bestWith.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Styles Tab */}
            <TabsContent value="styles" className="p-4 mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-4">
                Style က သင့် content ရဲ့ ဖွဲ့စည်းပုံနှင့် format ကို သတ်မှတ်ပေးပါတယ်။
              </p>
              <div className="grid gap-3">
                {styleGuides.map((style) => (
                  <div
                    key={style.name}
                    className="p-3 rounded-lg bg-card/50 border border-border/50 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{style.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">{style.name}</h4>
                          <span className="text-xs text-muted-foreground">({style.nameMyanmar})</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                        <div className="mt-2">
                          <p className="text-[10px] font-medium text-foreground">Structure:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {style.structure.map((s, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">
                                {i + 1}. {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          <span className="font-medium">Output:</span> {style.outputFormat}
                        </p>
                        <div className="mt-2 p-2 rounded bg-muted/30 text-[10px] italic text-muted-foreground">
                          "{style.example}"
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-[9px] text-muted-foreground">Best with:</span>
                          {style.bestWith.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Combinations Tab - Dynamic from Database */}
            <TabsContent value="combinations" className="p-4 mt-0 space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-muted-foreground">
                  Tone နဲ့ Style ကို ပေါင်းစပ်အသုံးပြုခြင်းဖြင့် ပိုမိုထိရောက်သော content ရရှိနိုင်ပါတယ်။
                </p>
                {isAdmin && (
                  <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">
                    <Pencil className="h-2.5 w-2.5 mr-1" />
                    Admin Edit Mode
                  </Badge>
                )}
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : combinations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No combinations found
                </div>
              ) : (
                <div className="grid gap-3">
                  {combinations.map((combo) => (
                    <div
                      key={combo.id}
                      className="p-3 rounded-lg bg-card/50 border border-border/50 hover:border-primary/30 transition-all"
                    >
                      {/* Header with badges and actions */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">{combo.icon}</span>
                          <Badge className="bg-primary/20 text-primary text-[10px]">{combo.tone}</Badge>
                          <span className="text-muted-foreground text-xs">+</span>
                          <Badge variant="outline" className="text-[10px]">{combo.style}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <ExampleDialog combo={combo} />
                          {isAdmin && (
                            <EditCombinationDialog combo={combo} onSave={handleRefresh} />
                          )}
                        </div>
                      </div>
                      
                      {/* Result - English + Myanmar */}
                      <p className="text-xs text-foreground mb-1">{combo.result}</p>
                      {combo.result_myanmar && (
                        <p className="text-[10px] text-muted-foreground/70 mb-2">{combo.result_myanmar}</p>
                      )}
                      
                      {/* Use Case - English + Myanmar */}
                      <p className="text-[10px] text-muted-foreground mb-1">
                        <span className="font-medium">Use for: </span>{combo.use_case}
                      </p>
                      {combo.use_case_myanmar && (
                        <p className="text-[10px] text-muted-foreground/60 mb-2">
                          <span className="font-medium">အသုံးပြုရန်: </span>{combo.use_case_myanmar}
                        </p>
                      )}
                      
                      {/* Short example */}
                      {combo.example && (
                        <div className="bg-muted/30 rounded p-2 text-[10px] italic text-muted-foreground">
                          "{combo.example}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tips Tab - Comprehensive Bilingual Guide */}
            <TabsContent value="tips" className="p-4 mt-0 space-y-4">
              <div className="text-center mb-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  ပိုကောင်းတဲ့ AI Content ရရှိဖို့ လမ်းညွှန်ချက်များ
                </h3>
                <p className="text-xs text-muted-foreground">
                  Comprehensive guide to get the best AI-generated content
                </p>
              </div>

              <Accordion type="multiple" className="space-y-2">
                {/* 1. Prompt Writing Tips */}
                <AccordionItem value="prompt-writing" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📝</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Prompt Writing Tips</h4>
                        <p className="text-[10px] text-muted-foreground">အသေးစိတ် ရေးသားနည်း လမ်းညွှန်</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="space-y-2 text-xs">
                      <p className="text-muted-foreground">
                        <strong className="text-foreground">What to include in your prompt:</strong>
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                        <li><strong>Topic:</strong> What you want to write about (ဘာအကြောင်း ရေးချင်လဲ)</li>
                        <li><strong>Target Audience:</strong> Who will read this content (ဘယ်သူတွေ ဖတ်မလဲ)</li>
                        <li><strong>Desired Length:</strong> Word count or article type (ဘယ်လောက်ရှည်ချင်လဲ)</li>
                        <li><strong>Key Points:</strong> Main ideas to cover (ဖော်ပြလိုတဲ့ အချက်များ)</li>
                        <li><strong>Purpose:</strong> Goal of the content (ရည်ရွယ်ချက်)</li>
                      </ul>
                    </div>
                    
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-destructive mb-2">❌ Bad Prompt Example:</p>
                      <code className="text-[10px] text-muted-foreground block bg-muted/50 p-2 rounded">
                        "Write about crypto"
                      </code>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        ဒီလို prompt က အလွန်မရှင်းလင်းပါဘူး။ AI က ဘာရေးရမှန်း မသိနိုင်ပါ။
                      </p>
                    </div>
                    
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-primary mb-2">✅ Good Prompt Example:</p>
                      <code className="text-[10px] text-muted-foreground block bg-muted/50 p-2 rounded whitespace-pre-wrap">
{`"Write a beginner-friendly article about Bitcoin for Myanmar readers who are new to cryptocurrency. 
Cover: what is Bitcoin, how it works, and how to buy it safely in Myanmar. 
Target length: 800-1000 words. 
Include practical tips and warnings about scams."`}
                      </code>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        ဒီလို prompt က ရှင်းလင်းပြီး AI က အတိအကျ ရေးပေးနိုင်ပါတယ်။
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 2. Tone Selection Guide */}
                <AccordionItem value="tone-selection" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🎯</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Tone Selection Guide</h4>
                        <p className="text-[10px] text-muted-foreground">Tone ရွေးချယ်နည်း လမ်းညွှန်</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Tone က သင့် content ရဲ့ ခံစားချက်ကို ဆုံးဖြတ်ပေးပါတယ်။ မှန်ကန်တဲ့ tone ကို ရွေးပါ။
                    </p>
                    
                    <div className="grid gap-2">
                      <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-xs font-medium text-blue-400">🏢 Professional</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <strong>Use for:</strong> Business reports, official communications, corporate content
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          <strong>အသုံးပြုရန်:</strong> စီးပွားရေး အစီရင်ခံစာများ၊ တရားဝင် ဆက်သွယ်ရေးများ
                        </p>
                      </div>
                      
                      <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <p className="text-xs font-medium text-green-400">😊 Casual</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <strong>Use for:</strong> Social media posts, personal blogs, informal content
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          <strong>အသုံးပြုရန်:</strong> Social media posts များ၊ ကိုယ်ရေး blog များ
                        </p>
                      </div>
                      
                      <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-xs font-medium text-yellow-400">🤗 Friendly</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <strong>Use for:</strong> Customer support, tutorials, educational content
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          <strong>အသုံးပြုရန်:</strong> Customer support များ၊ သင်ခန်းစာများ
                        </p>
                      </div>
                      
                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs font-medium text-red-400">💪 Tough Love</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <strong>Use for:</strong> Wake-up call content, transformation programs, motivational challenges
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          <strong>အသုံးပြုရန်:</strong> နိုးကြားစေတဲ့ content များ၊ ပြောင်းလဲရေး အစီအစဉ်များ
                        </p>
                      </div>
                      
                      <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <p className="text-xs font-medium text-purple-400">🎓 Educational</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <strong>Use for:</strong> Courses, how-to guides, technical explanations
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          <strong>အသုံးပြုရန်:</strong> သင်တန်းများ၊ လုပ်နည်း လမ်းညွှန်များ
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 3. Style Selection Guide */}
                <AccordionItem value="style-selection" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">✍️</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Style Selection Guide</h4>
                        <p className="text-[10px] text-muted-foreground">Style ရွေးချယ်နည်း လမ်းညွှန်</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Style က သင့် content ရဲ့ ဖွဲ့စည်းပုံနှင့် ပုံစံကို ဆုံးဖြတ်ပေးပါတယ်။
                    </p>
                    
                    <div className="space-y-2">
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium">📰 Article</p>
                        <p className="text-[10px] text-muted-foreground">Long-form, structured content with clear sections</p>
                        <p className="text-[10px] text-muted-foreground/70">ရှည်လျားပြီး ကျွမ်းကျင်တဲ့ ဖွဲ့စည်းပုံရှိတဲ့ content</p>
                      </div>
                      
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium">📝 Blog Post</p>
                        <p className="text-[10px] text-muted-foreground">Personal, engaging stories with conversational flow</p>
                        <p className="text-[10px] text-muted-foreground/70">ကိုယ်ရေးကိုယ်တာ၊ စိတ်ဝင်စားစရာ ပုံပြင်များ</p>
                      </div>
                      
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium">📋 Tutorial</p>
                        <p className="text-[10px] text-muted-foreground">Step-by-step guides with numbered instructions</p>
                        <p className="text-[10px] text-muted-foreground/70">အဆင့်လိုက် လုပ်ဆောင်နည်း လမ်းညွှန်များ</p>
                      </div>
                      
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium">🎬 Script</p>
                        <p className="text-[10px] text-muted-foreground">Video/podcast scripts with spoken language style</p>
                        <p className="text-[10px] text-muted-foreground/70">Video/Podcast အတွက် စကားပြော ပုံစံ script များ</p>
                      </div>
                      
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium">📢 Social Media</p>
                        <p className="text-[10px] text-muted-foreground">Short, punchy content optimized for engagement</p>
                        <p className="text-[10px] text-muted-foreground/70">တိုတောင်းပြီး အာရုံဖမ်းနိုင်တဲ့ social content များ</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 4. Web Search Usage */}
                <AccordionItem value="web-search" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🌐</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Web Search Usage</h4>
                        <p className="text-[10px] text-muted-foreground">Web Search အသုံးပြုနည်း</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="grid gap-3">
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary mb-2">✅ When to ENABLE Web Search:</p>
                        <ul className="list-disc list-inside space-y-1 text-[10px] text-muted-foreground ml-2">
                          <li>Current events & news (လတ်တလော သတင်းများ)</li>
                          <li>Latest price updates (နောက်ဆုံးပေါ် ဈေးနှုန်းများ)</li>
                          <li>Trending topics (Trending ခေါင်းစဉ်များ)</li>
                          <li>Statistics & data (ကိန်းဂဏန်း အချက်အလက်များ)</li>
                          <li>Recent developments (မကြာသေးမီ ဖြစ်ရပ်များ)</li>
                        </ul>
                      </div>
                      
                      <div className="p-3 bg-muted/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium mb-2">⏸️ When to DISABLE Web Search:</p>
                        <ul className="list-disc list-inside space-y-1 text-[10px] text-muted-foreground ml-2">
                          <li>Evergreen content (အချိန်မရွေး ကြည့်နိုင်တဲ့ content)</li>
                          <li>Personal opinions & stories (ကိုယ်ပိုင် အမြင်များ)</li>
                          <li>Creative writing (ဖန်တီးရေးသား content)</li>
                          <li>General how-to guides (ယေဘုယျ လမ်းညွှန်များ)</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-amber-400 mb-1">💡 Pro Tip:</p>
                      <p className="text-[10px] text-muted-foreground">
                        Web Search ဖွင့်ထားရင် AI က လတ်တလော အချက်အလက်တွေကို ရှာဖွေပြီး သင့် content ထဲ ထည့်သွင်းပေးပါမယ်။
                        ဒါပေမယ့် ပိုကြာနိုင်ပါတယ်။
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 5. Knowledge Base Integration */}
                <AccordionItem value="knowledge-base" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📚</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Knowledge Base Integration</h4>
                        <p className="text-[10px] text-muted-foreground">Knowledge Base အသုံးပြုနည်း</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      သင်သိမ်းထားတဲ့ content တွေကို AI က သင့် brand voice အတွက် reference အဖြစ် သုံးပါတယ်။
                    </p>
                    
                    <div className="space-y-2">
                      <div className="p-2 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium mb-1">🎯 How it works:</p>
                        <ol className="list-decimal list-inside space-y-1 text-[10px] text-muted-foreground ml-2">
                          <li>Save your best content to Knowledge Base</li>
                          <li>AI learns your writing style and tone</li>
                          <li>Future content matches your brand voice</li>
                          <li>Consistency across all your content</li>
                        </ol>
                      </div>
                      
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary mb-1">💡 Best Practices:</p>
                        <ul className="list-disc list-inside space-y-1 text-[10px] text-muted-foreground ml-2">
                          <li>သင့်အကောင်းဆုံး content 10-20 ခု သိမ်းထားပါ</li>
                          <li>မတူညီတဲ့ topic များ ပါဝင်အောင် လုပ်ပါ</li>
                          <li>သင့် unique voice ပါတဲ့ content တွေကို ဦးစားပေးပါ</li>
                          <li>ပုံမှန် update လုပ်ပေးပါ</li>
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 6. Iteration & Refinement */}
                <AccordionItem value="iteration" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🔄</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Iteration & Refinement</h4>
                        <p className="text-[10px] text-muted-foreground">ထပ်ခါထပ်ခါ ပြင်ဆင်နည်း</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="space-y-3">
                      <div className="p-3 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium mb-2">🎯 Effective Iteration Process:</p>
                        <ol className="list-decimal list-inside space-y-2 text-[10px] text-muted-foreground ml-2">
                          <li>
                            <strong>First Generate:</strong> Get the initial content
                            <span className="block text-muted-foreground/70 ml-4">ပထမဆုံး content ကို ထုတ်ပါ</span>
                          </li>
                          <li>
                            <strong>Review & Note:</strong> Mark what's good and what needs improvement
                            <span className="block text-muted-foreground/70 ml-4">ဘာကောင်းတယ်၊ ဘာပြင်ရမယ် မှတ်ထားပါ</span>
                          </li>
                          <li>
                            <strong>Regenerate:</strong> Try different tone/style combinations
                            <span className="block text-muted-foreground/70 ml-4">မတူညီတဲ့ tone/style combination တွေ စမ်းပါ</span>
                          </li>
                          <li>
                            <strong>Combine:</strong> Take best parts from each version
                            <span className="block text-muted-foreground/70 ml-4">အကောင်းဆုံး အပိုင်းတွေကို ပေါင်းစည်းပါ</span>
                          </li>
                          <li>
                            <strong>Polish:</strong> Add your personal touches
                            <span className="block text-muted-foreground/70 ml-4">သင့်ကိုယ်ပိုင် touch ထည့်ပါ</span>
                          </li>
                        </ol>
                      </div>
                      
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-400 mb-1">💡 Pro Tip:</p>
                        <p className="text-[10px] text-muted-foreground">
                          တစ်ခုတည်းကို 2-3 ကြိမ် ထုတ်ပြီး အကောင်းဆုံးတွေကို ပေါင်းတာက 
                          တစ်ကြိမ်တည်း ထုတ်တာထက် အမြဲပိုကောင်းပါတယ်။
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 7. Post-Generation Editing */}
                <AccordionItem value="post-editing" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">✨</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Post-Generation Editing</h4>
                        <p className="text-[10px] text-muted-foreground">AI ထုတ်ပြီးနောက် ပြင်ဆင်နည်း</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      AI content ကို ထုတ်ပြီးရင် ဒီအဆင့်တွေ လုပ်ပါ -
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-2 bg-card/50 border border-border/50 rounded-lg">
                        <span className="text-sm">1️⃣</span>
                        <div>
                          <p className="text-xs font-medium">Fact-Check Important Claims</p>
                          <p className="text-[10px] text-muted-foreground">အရေးကြီးတဲ့ အချက်အလက်တွေကို စစ်ဆေးပါ</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 p-2 bg-card/50 border border-border/50 rounded-lg">
                        <span className="text-sm">2️⃣</span>
                        <div>
                          <p className="text-xs font-medium">Add Personal Examples</p>
                          <p className="text-[10px] text-muted-foreground">သင့်ကိုယ်ပိုင် ဥပမာများ ထည့်ပါ</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 p-2 bg-card/50 border border-border/50 rounded-lg">
                        <span className="text-sm">3️⃣</span>
                        <div>
                          <p className="text-xs font-medium">Adjust Tone for Your Brand</p>
                          <p className="text-[10px] text-muted-foreground">သင့် brand အတွက် tone ကို ပြင်ဆင်ပါ</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 p-2 bg-card/50 border border-border/50 rounded-lg">
                        <span className="text-sm">4️⃣</span>
                        <div>
                          <p className="text-xs font-medium">Remove Generic Phrases</p>
                          <p className="text-[10px] text-muted-foreground">ယေဘုယျ စကားစုတွေကို ဖယ်ထုတ်ပါ</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 p-2 bg-card/50 border border-border/50 rounded-lg">
                        <span className="text-sm">5️⃣</span>
                        <div>
                          <p className="text-xs font-medium">Add Local Context</p>
                          <p className="text-[10px] text-muted-foreground">ဒေသဆိုင်ရာ context များ ထည့်ပါ</p>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 8. Common Mistakes to Avoid */}
                <AccordionItem value="mistakes" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">⚠️</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Common Mistakes to Avoid</h4>
                        <p className="text-[10px] text-muted-foreground">ရှောင်ကြဉ်ရမယ့် အမှားများ</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="space-y-2">
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs font-medium text-destructive">❌ Vague Prompts</p>
                        <p className="text-[10px] text-muted-foreground">
                          Context မပါတဲ့ prompt များကို ရှောင်ပါ။ "Write about crypto" လို prompt က ရလဒ်မကောင်းပါ။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs font-medium text-destructive">❌ Mismatched Tone + Style</p>
                        <p className="text-[10px] text-muted-foreground">
                          Professional tone နဲ့ Social Media style တို့လို မကိုက်ညီတဲ့ combination တွေကို ရှောင်ပါ။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs font-medium text-destructive">❌ 100% AI Reliance</p>
                        <p className="text-[10px] text-muted-foreground">
                          AI ထုတ်ပေးတဲ့ content ကို ပြန်မစစ်ဘဲ တိုက်ရိုက်မသုံးပါနဲ့။ အမြဲ review လုပ်ပါ။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs font-medium text-destructive">❌ Ignoring Web Search for Current Topics</p>
                        <p className="text-[10px] text-muted-foreground">
                          လတ်တလော topic တွေအတွက် Web Search မဖွင့်ဘဲ ရေးတာက outdated information ဖြစ်စေနိုင်ပါတယ်။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-xs font-medium text-destructive">❌ Not Building Knowledge Base</p>
                        <p className="text-[10px] text-muted-foreground">
                          Knowledge Base မသိမ်းဘဲ ထားတာက AI ရဲ့ brand voice learning ကို အားနည်းစေပါတယ်။
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 9. Pro Tips */}
                <AccordionItem value="pro-tips" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">💡</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Pro Tips</h4>
                        <p className="text-[10px] text-muted-foreground">ကျွမ်းကျင်သူများအတွက် အကြံပြုချက်များ</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="grid gap-2">
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary">🎯 Specify Word Count</p>
                        <p className="text-[10px] text-muted-foreground">
                          "800-1000 words" လို တိတိကျကျ ပေးပါ။ AI က အတိအကျ ရေးပေးပါမယ်။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary">📊 Reference Past Success</p>
                        <p className="text-[10px] text-muted-foreground">
                          သင့်အကောင်းဆုံး content ကို Knowledge Base မှာ သိမ်းထားပြီး AI ကို reference ပေးပါ။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary">🔄 A/B Test Combinations</p>
                        <p className="text-[10px] text-muted-foreground">
                          တူညီတဲ့ topic အတွက် မတူညီတဲ့ tone + style combination တွေကို စမ်းသုံးပါ။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary">🌐 Strategic Web Search</p>
                        <p className="text-[10px] text-muted-foreground">
                          ဈေးနှုန်း၊ statistics ပါတဲ့ content အတွက်သာ Web Search ဖွင့်ပါ။ ပိုမြန်ပြီး ပိုကောင်းပါမယ်။
                        </p>
                      </div>
                      
                      <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary">📝 Use Myanmar + English</p>
                        <p className="text-[10px] text-muted-foreground">
                          Myanmar audience အတွက် ရေးရင် prompt ထဲမှာ "Myanmar language" ဖြစ်ကြောင်း ထည့်ပေးပါ။
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 10. Brand Voice Consistency */}
                <AccordionItem value="brand-voice" className="border border-border/50 rounded-lg bg-card/30 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🎨</span>
                      <div className="text-left">
                        <h4 className="font-medium text-sm">Brand Voice Consistency</h4>
                        <p className="text-[10px] text-muted-foreground">Brand Voice တသမတ်တည်း ထိန်းသိမ်းနည်း</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      သင့် content တိုင်းမှာ တသမတ်တည်း ဖြစ်တဲ့ brand voice ရှိဖို့ အရေးကြီးပါတယ်။
                    </p>
                    
                    <div className="space-y-2">
                      <div className="p-3 bg-card/50 border border-border/50 rounded-lg">
                        <p className="text-xs font-medium mb-2">🎯 Building Your Brand Voice:</p>
                        <ol className="list-decimal list-inside space-y-1 text-[10px] text-muted-foreground ml-2">
                          <li>Define your core values and personality</li>
                          <li>Identify your target audience's language</li>
                          <li>Create consistent tone across all content</li>
                          <li>Save successful content to Knowledge Base</li>
                          <li>Let AI learn from your best work</li>
                        </ol>
                      </div>
                      
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs font-medium text-primary mb-2">✅ Consistency Checklist:</p>
                        <ul className="space-y-1 text-[10px] text-muted-foreground">
                          <li>☐ Same tone across all platforms</li>
                          <li>☐ Consistent vocabulary and phrases</li>
                          <li>☐ Unified visual style references</li>
                          <li>☐ Regular Knowledge Base updates</li>
                          <li>☐ Brand guidelines documentation</li>
                        </ul>
                        <p className="text-[10px] text-muted-foreground/70 mt-2">
                          ဒီ checklist ကို သုံးပြီး သင့် brand voice ကို တသမတ်တည်း ထိန်းသိမ်းပါ။
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
