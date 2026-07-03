import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Footer";
import { PublicMobileNav } from "@/components/PublicMobileNav";
import { usePageMeta } from "@/hooks/usePageMeta";
import { JsonLd, organizationSchema, websiteSchema } from "@/components/SEO/JsonLd";
import { TestimonialsSection } from "@/components/TestimonialsSection";
import { PlatformShowcaseSection } from "@/components/PlatformShowcaseSection";
import { BeeBotShowcaseSection } from "@/components/BeeBotShowcaseSection";
import { PoweredBySection } from "@/components/PoweredBySection";
import LatestPostsSection from "@/components/LatestPostsSection";
import CampaignsSection from "@/components/CampaignsSection";
import { AIContentSection } from "@/components/AIContentSection";
import { PricingSection } from "@/components/PricingSection";

const Landing = () => {
  usePageMeta({
    title: "ZOE CRYPTO – Free Crypto Education & AI Tools | Myanmar",
    description:
      "Learn 100% free crypto and supercharge your content workflow with Real-time AI writing, Gamified Team Management, and Expert Courses.",
  });

  return (
    <div className="min-h-screen bg-background w-full">
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <Navbar />
      <main>
        <Hero />
        <TestimonialsSection />
        <PlatformShowcaseSection />
        <BeeBotShowcaseSection />
        <PoweredBySection />
        <LatestPostsSection />
        <CampaignsSection />
        <AIContentSection />
        <PricingSection />
      </main>
      <Footer />
      <PublicMobileNav />
    </div>
  );
};

export default Landing;
