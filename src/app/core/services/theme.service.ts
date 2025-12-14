import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  constructor() {
    // Force light mode
    document.documentElement.setAttribute('data-theme', 'light');
  }
}
