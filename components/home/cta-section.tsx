"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import Image from "next/image";

export function CTASection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[2rem] p-8 md:p-12 max-w-5xl mx-auto"
        >
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <Image 
              src="/assets/andrew-molo-4MoRgY7H42s-unsplash.jpg"
              alt="Water background"
              fill
              style={{ objectFit: 'cover' }}
              priority
            />
            {/* Dark overlay for better text readability */}
            <div className="absolute inset-0 bg-black/50 z-10" />
          </div>
          
          {/* Decorative elements */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-secondary z-20" />
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-secondary/20 blur-2xl z-10" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-secondary/20 blur-2xl z-10" />
          
          <div className="relative z-20">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-white"
              >
                Access Water Permit Services
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-white/90 mb-8 max-w-2xl mx-auto text-lg"
              >
                The official portal for water concession permit applications. Our digital services enable efficient processing and management of water permits.
              </motion.p>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto"
            >
              <Card className="bg-white p-6 rounded-xl shadow-lg border-none">
                <h3 className="font-semibold text-lg mb-2">New Applications</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Submit a new water concession permit application
                </p>
                <Link href="/apply">
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full">
                    Begin Application
                  </Button>
                </Link>
              </Card>
              
              <Card className="bg-white p-6 rounded-xl shadow-lg border-none">
                <h3 className="font-semibold text-lg mb-2">Existing Applications</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Check status or manage your current applications
                </p>
                <Link href="/login">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                    Sign In
                  </Button>
                </Link>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="text-center mt-10 text-white/80 text-sm"
            >
              Need assistance? <Link href="https://waterpermit.rwb.rw/contact" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Contact our support</Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
} 