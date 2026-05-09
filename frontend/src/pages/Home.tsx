import "../style.css";
import latticeMakerLogo from "../../public/latticeMakerLogo.png";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const images = [
  "../public/home-slider-1.jpg",
  "../public/home-slider-2.jpg",
  "../public/home-slider-3.jpg",
];

// Assume you have these components already made/pasted in (like Card and Carousel)
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import BannerV1 from "@/components/Banner";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function LatticeToolHero() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <BannerV1 />

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <Card className="overflow-hidden border-slate-200 shadow-xl bg-white">
          <CardContent className="py-10 md:py-12 flex flex-col items-center">
            <div className="w-full max-w-5xl flex items-start justify-end">
              <Sheet>
                <SheetTrigger
                  render={
                    <Button type="button" variant="outline" size="sm" />
                  }
                >
                  About TAMC
                </SheetTrigger>
                <SheetContent side="right" className="w-[90vw] sm:w-[440px]">
                  <SheetHeader>
                    <SheetTitle>Technion AM Center</SheetTitle>
                    <SheetDescription>
                      A quick overview of TAMC’s mission and focus areas.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-6 pb-6 space-y-4 text-slate-700 leading-relaxed">
                    <p>
                      The Technion Additive Manufacturing and 3D printing Center
                      (TAMC), inaugurated in 2021, reflects the Technion‘s
                      commitment to promoting cutting-edge additive manufacturing
                      (AM) innovation. The center was founded with the generous
                      support of Mr. Robert Davis and is committed to fulfilling
                      an academic leadership role in promoting futuristic
                      advancements in AM technology, as well as supporting
                      Israeli industry.
                    </p>
                    <p>
                      TAM will develop a comprehensive repository of AM data and
                      technologies while encouraging, advising, and supporting
                      synergic AM research efforts across an array of healthcare,
                      transportation, energy, aerospace, and other needs. The
                      TAM center will constitute a hub for enhancing and sharing
                      additive manufacturing infrastructure, scientific knowledge
                      and skillsets, and for supporting multidisciplinary AM
                      research.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="max-w-max space-y-6 text-slate-700 leading-relaxed text-lg mt-6">
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

            <div className="w-full flex flex-col items-center">
              <Button
                onClick={() => navigate("/tool")}
                className="mt-12 group h-20 px-10 bg-brand-blue hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                <div className="flex items-center gap-6">
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
          </CardContent>

          <Separator />

          <CardFooter className="bg-slate-50/50 py-8 w-full justify-center">
            <div className="w-full max-w-5xl mx-auto relative group px-6">
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
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
