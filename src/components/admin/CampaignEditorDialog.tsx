import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Gift } from "lucide-react";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  campaign_url: string;
  is_active: boolean;
  expires_at: string | null;
  display_order: number;
}

interface CampaignEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  thumbnail_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  campaign_url: z.string().url("Must be a valid URL"),
  is_active: z.boolean(),
  expires_at: z.string().optional().or(z.literal("")),
  display_order: z.coerce.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export function CampaignEditorDialog({
  open,
  onOpenChange,
  campaign,
}: CampaignEditorDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      thumbnail_url: "",
      campaign_url: "",
      is_active: true,
      expires_at: "",
      display_order: 0,
    },
  });

  useEffect(() => {
    if (campaign) {
      form.reset({
        title: campaign.title,
        description: campaign.description || "",
        thumbnail_url: campaign.thumbnail_url || "",
        campaign_url: campaign.campaign_url,
        is_active: campaign.is_active,
        expires_at: campaign.expires_at
          ? new Date(campaign.expires_at).toISOString().slice(0, 16)
          : "",
        display_order: campaign.display_order,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        thumbnail_url: "",
        campaign_url: "",
        is_active: true,
        expires_at: "",
        display_order: 0,
      });
    }
  }, [campaign, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const data = {
        title: values.title,
        description: values.description || null,
        thumbnail_url: values.thumbnail_url || null,
        campaign_url: values.campaign_url,
        is_active: values.is_active,
        expires_at: values.expires_at ? new Date(values.expires_at).toISOString() : null,
        display_order: values.display_order,
        created_by: user?.id,
      };

      if (campaign) {
        const { error } = await supabase
          .from("campaigns")
          .update(data)
          .eq("id", campaign.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("campaigns").insert(data);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["active-campaigns"] });
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save campaign");
      console.error(error);
    },
  });

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {campaign ? "Edit Campaign" : "Create Campaign"}
          </DialogTitle>
          <DialogDescription>
            {campaign
              ? "Update the campaign details below"
              : "Add a new promotional campaign"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Binance အကောင့်ဖွင့်ပြီး $100 ယူ" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Campaign description..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="campaign_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign URL *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://binance.com/ref/..."
                      type="url"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Your referral or campaign link
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="thumbnail_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thumbnail URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      type="url"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Campaign banner or thumbnail image
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="expires_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires At</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormDescription>Leave empty for no expiry</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="display_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormDescription>Lower = shown first</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Show this campaign on the landing page
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {campaign ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
