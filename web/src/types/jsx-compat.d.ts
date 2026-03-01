import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
  }
}

export {};
