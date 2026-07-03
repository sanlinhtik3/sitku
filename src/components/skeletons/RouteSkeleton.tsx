import { useLocation } from "react-router-dom";
import { CoursesPageSkeleton } from "./CoursesPageSkeleton";
import { LearnPageSkeleton } from "./LearnPageSkeleton";
import { DashboardPageSkeleton } from "./DashboardPageSkeleton";
import { PageSkeleton } from "./PageSkeleton";

export const RouteSkeleton = () => {
  const location = useLocation();
  const path = location.pathname;

  // Show route-specific skeleton based on current path
  if (path === "/courses") {
    return <CoursesPageSkeleton />;
  }
  
  if (path.startsWith("/learn")) {
    return <LearnPageSkeleton />;
  }
  
  if (path === "/dashboard") {
    return <DashboardPageSkeleton />;
  }

  // Default skeleton for all other routes
  return <PageSkeleton />;
};
