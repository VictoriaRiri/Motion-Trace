declare module "lucide-react" {
  import * as React from "react";

  type IconProps = React.SVGProps<SVGSVGElement> & {
    size?: number | string;
  };

  export const Maximize2: React.ComponentType<IconProps>;
  export const Pause: React.ComponentType<IconProps>;
  export const Play: React.ComponentType<IconProps>;
  export const StepForward: React.ComponentType<IconProps>;
  export const Upload: React.ComponentType<IconProps>;
}
