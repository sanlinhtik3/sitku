import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, ShieldOff, Mail, MessageCircle } from "lucide-react";

export const AuthDisabledPage = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Coins className="h-10 w-10 text-primary" />
          <span className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            ZOE CRYPTO
          </span>
        </Link>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <ShieldOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Authentication Temporarily Disabled</CardTitle>
            <CardDescription className="text-base">
              We're currently performing system maintenance. Registration and sign-in are temporarily unavailable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                We apologize for the inconvenience. Please check back soon or contact our support team if you need immediate assistance.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Email Support</p>
                    <a 
                      href="mailto:support@zoecrypto.com" 
                      className="text-sm text-primary hover:underline truncate block"
                    >
                      support@zoecrypto.com
                    </a>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MessageCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Telegram Support</p>
                    <a 
                      href="https://t.me/zoecrypto_support" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate block"
                    >
                      @zoecrypto_support
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Link to="/">
                <Button variant="outline" className="w-full">
                  Return to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Thank you for your patience and understanding.
        </p>
      </div>
    </div>
  );
};
