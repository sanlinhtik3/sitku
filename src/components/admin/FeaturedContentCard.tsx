import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Eye, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FeaturedContentCardProps {
  title: string;
  enrollments: number;
  views?: number;
  thumbnailUrl?: string;
  courseId?: string;
}

export const FeaturedContentCard = ({
  title,
  enrollments,
  views,
  thumbnailUrl,
  courseId
}: FeaturedContentCardProps) => {
  const navigate = useNavigate();

  return (
    <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary via-primary/90 to-secondary h-full min-h-[240px] sm:min-h-[280px] hover:shadow-xl transition-all duration-300 group active:scale-[0.98]">
      {thumbnailUrl && (
        <div 
          className="absolute inset-0 opacity-20 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
          style={{ backgroundImage: `url(${thumbnailUrl})` }}
        />
      )}
      <CardContent className="relative z-10 p-5 sm:p-6 h-full flex flex-col justify-between text-white">
        <div>
          <div className="inline-block px-3 py-1.5 sm:px-3 sm:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium mb-3 sm:mb-4">
            Top Performing Course
          </div>
          <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 leading-tight">{title}</h3>
        </div>
        
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 sm:h-5 sm:w-5" />
              <div>
                <p className="text-2xl sm:text-3xl font-bold">{enrollments}</p>
                <p className="text-xs text-white/80">Total Enrollments</p>
              </div>
            </div>
          </div>
          
          <Button 
            variant="secondary" 
            className="w-full h-12 sm:h-10 text-base sm:text-sm bg-white text-primary hover:bg-white/90 active:scale-95 transition-transform"
            onClick={() => courseId && navigate(`/admin#courses`)}
          >
            View Details
            <ArrowUpRight className="ml-2 h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
