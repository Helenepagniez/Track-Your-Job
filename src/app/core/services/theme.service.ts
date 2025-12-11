import { Injectable, signal, effect } from '@angular/core';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  darkMode = signal<boolean>(false);

  constructor(private localStorageService: LocalStorageService) {
    // Load theme from unified localStorage
    const theme = this.localStorageService.getTheme();
    this.darkMode.set(theme === 'dark');

    // Effect to update DOM and localStorage
    effect(() => {
      const isDark = this.darkMode();
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      this.localStorageService.updateTheme(isDark ? 'dark' : 'light');
    });
  }

  toggleTheme() {
    this.darkMode.update(d => !d);
  }
}
