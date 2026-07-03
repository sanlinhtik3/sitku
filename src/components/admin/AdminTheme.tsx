import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { Palette, Check } from "lucide-react";

export function AdminTheme() {
  const { theme, updateTheme, isUpdating } = useThemeSettings();

  const handleSetTheme = () => {
    updateTheme({
      theme_name: 'teal',
      primary_color: '160 100% 50%'
    });
  };

  const isCurrentTheme = theme?.theme_name === 'teal';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Theme Settings</h2>
        <p className="text-muted-foreground">
          Customize the appearance of your platform
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Platform Theme
          </CardTitle>
          <CardDescription>
            The Crypto Teal theme provides a modern, professional look for your education platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-6 rounded-lg border-2 bg-card" style={{
            borderColor: isCurrentTheme ? '#00ffa7' : 'hsl(var(--border))',
            backgroundColor: isCurrentTheme ? '#00ffa710' : 'transparent'
          }}>
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-lg shadow-md"
                style={{ 
                  background: 'linear-gradient(135deg, #00ffa7, #00cc85)'
                }}
              />
              <div>
                <h3 className="font-semibold text-lg">Crypto Teal</h3>
                <p className="text-sm text-muted-foreground">
                  Modern and vibrant teal theme
                </p>
                <div className="mt-3 flex gap-2">
                  <div 
                    className="w-8 h-8 rounded border"
                    style={{ background: 'linear-gradient(135deg, #00ffa7, #00ffa7dd)' }}
                  />
                  <div 
                    className="w-8 h-8 rounded border"
                    style={{ backgroundColor: 'hsl(var(--card))' }}
                  />
                  <div 
                    className="w-8 h-8 rounded border"
                    style={{ backgroundColor: 'hsl(var(--background))' }}
                  />
                </div>
              </div>
            </div>
            
            {isCurrentTheme ? (
              <div className="flex items-center gap-2" style={{ color: '#00ffa7' }}>
                <div className="rounded-full p-2 bg-current/10">
                  <Check className="w-5 h-5" />
                </div>
                <span className="font-medium">Active</span>
              </div>
            ) : (
              <Button 
                onClick={handleSetTheme}
                disabled={isUpdating}
                size="lg"
              >
                {isUpdating ? 'Applying...' : 'Apply Theme'}
              </Button>
            )}
          </div>

          {theme && (
            <div className="mt-6 p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                <strong>Current theme:</strong> Crypto Teal
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {new Date(theme.updated_at).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Global Theme Application</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            The theme is applied instantly across the entire platform for all users.
            It affects buttons, links, highlights, and other accent elements throughout the interface.
            Theme settings are cached locally for fast loading and sync automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
