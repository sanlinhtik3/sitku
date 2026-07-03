import { User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface InstructorCardProps {
  name: string;
  bio?: string;
  avatar?: string;
}

export const InstructorCard = ({ name, bio, avatar }: InstructorCardProps) => {
  return (
    <Card className="p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] bg-card/50 backdrop-blur-sm border-border/40">
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider mb-4">
            Instructor
          </h3>
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 border-2 border-border/40">
              {avatar ? (
                <img src={avatar} alt={name} className="object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/10">
                  <User className="h-6 w-6 text-primary" />
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <p className="font-bold text-base text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground/80">Course Instructor</p>
            </div>
          </div>
        </div>
        
        {bio && (
          <div className="pt-4 border-t border-border/30">
            <p className="text-sm text-muted-foreground/90 leading-relaxed">
              {bio}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
