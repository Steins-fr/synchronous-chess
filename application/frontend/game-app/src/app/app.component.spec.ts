import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { MockBuilder } from 'ng-mocks';
import { describe, test, expect, beforeEach } from 'vitest';

describe('AppComponent', () => {
    beforeEach(() => {
        return MockBuilder(AppComponent).provide(provideZonelessChangeDetection());
    });

    test('should create the app', () => {
        const fixture: ComponentFixture<AppComponent> = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app).toBeTruthy();
    });

    test('should have as title \'synchronous-chess\'', () => {
        const fixture: ComponentFixture<AppComponent> = TestBed.createComponent(AppComponent);
        const app= fixture.componentInstance;
        expect(app['title']).toEqual('synchronous-chess');
    });

    test('should render title', () => {
        const fixture: ComponentFixture<AppComponent> = TestBed.createComponent(AppComponent);
        fixture.detectChanges();
        const compiled = fixture.nativeElement;
        expect(compiled.querySelector('nav').textContent).not.toContain('synchronous-chess app is running!');
    });
});
