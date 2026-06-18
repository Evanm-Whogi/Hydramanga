"use client";

import { createContext, useContext } from "react";

export const InCarouselContext = createContext(false);

export const useInCarousel = () => useContext(InCarouselContext);
