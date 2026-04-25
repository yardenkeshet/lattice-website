import "../style.css";
import latticeMakerLogo from "../../public/latticeMakerLogo.png";
import { Card, CardContent } from "@/components/ui/card";

const images = [
  "../public/home-slider-1.jpg",
  "../public/home-slider-2.jpg",
  "../public/home-slider-3.jpg",
];

import { cn } from "@/lib/utils";

// Assume you have these components already made/pasted in (like Card and Carousel)
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import Banner from "@/components/Banner";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function LatticeToolHero() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Banner />

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <Card className="overflow-hidden border-slate-200 shadow-xl bg-white">
          <CardContent className="p-0">
            {/* 1. Header Section (Your Blue Bar component would go here) */}

            {/* 2. Content & Action Section */}
            <div className="p-8 md:p-12 flex flex-col items-center">
              <div className="max-w-max space-y-6 text-slate-700 leading-relaxed text-lg">
                <p>
                  The Technion Additive Manufacturing and 3D printing Center
                  (TAMC) , inaugurated in 2021, reflects the Technion‘s
                  commitment to promoting cutting-edge additive manufacturing
                  (AM) innovation. The center was founded with the generous
                  support of Mr. Robert Davis and is committed to fulfilling an
                  academic leadership role in promoting futuristic advancements
                  in AM technology, as well as supporting Israeli industry.
                </p>
                <p>
                  TAM will develop a comprehensive repository of AM data and
                  technologies while encouraging, advising, and supporting
                  synergic AM research efforts across an array of healthcare,
                  transportation, energy, aerospace, and other needs. The TAM
                  center will constitute a hub for enhancing and sharing
                  additive manufacturing infrastructure, scientific knowledge
                  and skillsets, and for supporting multidisciplinary AM
                  research.
                </p>
              </div>

              {/* 3. Primary Call to Action Button */}
              <Button
                onClick={() => navigate("/tool")}
                className="mt-12 group h-20 px-10 bg-brand-blue hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                <div className="flex items-center gap-6">
                  {/* Logo integration */}
                  <div className="bg-white/10 p-2 rounded-lg">
                    <img
                      src={latticeMakerLogo}
                      alt="Lattice Logo"
                      className="h-10 w-10 invert brightness-0"
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-xs uppercase tracking-widest opacity-80">
                      Ready to build?
                    </p>
                    <p className="text-xl font-bold">Launch Lattice Maker</p>
                  </div>
                  <ArrowRight className="ml-4 group-hover:translate-x-2 transition-transform" />
                </div>
              </Button>
            </div>

            {/* 4. Carousel Section */}
            <div className="border-t border-slate-100 bg-slate-50/50 p-8">
              {/* <h3 className="text-center text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mb-8">
                Facility & Process Gallery
              </h3> */}
              <div className="max-w-5xl mx-auto relative group">
                <Carousel className="w-full">
                  <CarouselContent>
                    {images.map((url, index) => (
                      <CarouselItem key={index}>
                        <div className="aspect-video overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-slate-200">
                          <img
                            src={url}
                            alt={`Process ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden md:flex -left-12 border-slate-200 text-slate-400 hover:text-brand-blue" />
                  <CarouselNext className="hidden md:flex -right-12 border-slate-200 text-slate-400 hover:text-brand-blue" />
                </Carousel>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
