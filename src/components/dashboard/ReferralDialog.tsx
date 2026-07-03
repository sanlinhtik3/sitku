import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users } from "lucide-react";
import { ReferralWidget } from "@/components/ReferralWidget";
import { ReferralLeaderboard } from "@/components/ReferralLeaderboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ReferralDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReferralDialog = ({ open, onOpenChange }: ReferralDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Referral Program
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:gap-2 h-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3 py-2">My Referrals</TabsTrigger>
            <TabsTrigger value="leaderboard" className="text-xs sm:text-sm px-2 sm:px-3 py-2">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto mt-3 sm:mt-4 md:mt-6">
            <ReferralWidget />
          </TabsContent>

          <TabsContent value="leaderboard" className="flex-1 overflow-y-auto mt-3 sm:mt-4 md:mt-6">
            <ReferralLeaderboard />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
