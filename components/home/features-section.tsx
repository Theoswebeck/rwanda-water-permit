"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

const featuresData = [
  {
    title: "Application Tracking",
    description: "Monitor your water permit application status in real-time through our Rwanda Water Resources Board online dashboard.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bar-chart-3">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
  },
  {
    title: "Secure Processing",
    description: "The Rwanda Water Resources Board ensures your application data is protected with advanced security measures compliant with national regulations.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Efficient Service",
    description: "The Rwanda Water Resources Board digital system streamlines the water permit process to reduce processing time and administrative barriers.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
];

export function FeaturesSection() {
  return (
    <section className="py-24 bg-muted">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="text-sm font-medium text-primary mb-3">SERVICE FEATURES</div>
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-6">Rwanda Water Resources Board Portal Services</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The official Rwanda Water Resources Board portal provides essential services for managing water resources. 
            Our platform ensures compliance with Rwanda's water regulations while offering a transparent process.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {featuresData.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-background p-8 rounded-lg border border-border"
            >
              <div className="mb-5 text-primary">{feature.icon}</div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground mb-6">{feature.description}</p>
              <ul className="space-y-2">
                {index === 0 ? (
                  <>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Real-time application status updates</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Notification system for progress</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Complete application history</span>
                    </li>
                  </>
                ) : index === 1 ? (
                  <>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>National data protection standards</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Secure document storage</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Government-verified processing</span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Streamlined application submissions</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Available 24/7 for applications</span>
                    </li>
                    <li className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                      <span>Reduced processing time</span>
                    </li>
                  </>
                )}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 