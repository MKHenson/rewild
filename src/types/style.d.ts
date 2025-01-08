// import original module declarations
import 'solid-styled-components';

// and extend them!
declare module 'solid-styled-components' {
  export interface DefaultTheme {
    colors: {
      primary400: string;
      primary500: string;
      primary600: string;

      secondary400: string;
      secondary500: string;
      secondary600: string;

      error400: string;
      error500: string;
      error600: string;

      subtle400: string;
      subtle500: string;
      subtle600: string;

      onPrimary400: string;
      onPrimary500: string;
      onPrimary600: string;

      onSecondary400: string;
      onSecondary500: string;
      onSecondary600: string;

      onBackground: string;
      onSurface: string;
      onSubtle: string;
      onSurfaceLight: string;
      onSurfaceBorder: string;

      onError400: string;
      onError500: string;
      onError600: string;

      background: string;
      surface: string;
      shadowShort1: string;
      shadowShort2: string;
    };
  }
}
