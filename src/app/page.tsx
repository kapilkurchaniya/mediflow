import Link from "next/link";
import { ArrowRight, ShieldCheck, Activity, Brain, Box } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-teal-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Navigation */}
      <nav className="fixed w-full z-50 glass border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex-shrink-0 flex items-center space-x-2">
              <Activity className="h-8 w-8 text-brand-600" />
              <span className="font-bold text-2xl text-slate-900 tracking-tight">MediFlow</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-slate-600 hover:text-slate-900 font-medium transition-colors">
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-full font-medium transition-all shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 hover:-translate-y-0.5"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 max-w-7xl mx-auto z-10 flex flex-col lg:flex-row items-center">
        <div className="lg:w-1/2 lg:pr-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-100 text-brand-700 font-medium text-sm mb-6 border border-brand-200">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600"></span>
            </span>
            <span>Next-Generation Pharmacy OS</span>
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Intelligent <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-teal-500">
              Pharmacy Control
            </span>
          </h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-2xl">
            A production-grade, AI-powered ERP designed exclusively for modern pharmacies. Streamline billing, automate inventory, and ensure total compliance with zero effort.
          </p>
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <Link
              href="/register"
              className="flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all shadow-xl shadow-brand-500/30 hover:shadow-brand-500/50 hover:-translate-y-1 group"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="#features"
              className="flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-8 py-4 rounded-full font-semibold text-lg transition-all hover:shadow-md"
            >
              Explore Features
            </Link>
          </div>
        </div>
        
        {/* Abstract Hero Image / UI Mockup */}
        <div className="lg:w-1/2 mt-16 lg:mt-0 relative perspective-1000">
          <div className="relative w-full aspect-square max-w-lg mx-auto">
            {/* Main Floating Card */}
            <div className="absolute inset-0 bg-white/40 backdrop-blur-3xl rounded-3xl border border-white/60 shadow-2xl transform rotate-y-[-10deg] rotate-x-[5deg] transition-transform duration-500 hover:rotate-y-0 hover:rotate-x-0 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-slate-200 rounded-full"></div>
                  <div className="h-3 w-20 bg-slate-100 rounded-full"></div>
                </div>
                <div className="h-8 w-8 bg-brand-100 rounded-full flex items-center justify-center">
                  <Activity className="h-4 w-4 text-brand-600" />
                </div>
              </div>
              
              <div className="space-y-4 my-6 flex-1">
                <div className="h-24 bg-gradient-to-br from-brand-50 to-white rounded-xl border border-brand-100 p-4 flex flex-col justify-between">
                   <div className="h-3 w-1/3 bg-brand-200 rounded-full"></div>
                   <div className="h-6 w-1/2 bg-brand-600 rounded-full"></div>
                </div>
                <div className="flex space-x-4">
                  <div className="h-32 flex-1 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <div className="h-3 w-1/2 bg-slate-200 rounded-full mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-2 w-full bg-slate-100 rounded-full"></div>
                      <div className="h-2 w-5/6 bg-slate-100 rounded-full"></div>
                      <div className="h-2 w-4/6 bg-slate-100 rounded-full"></div>
                    </div>
                  </div>
                  <div className="h-32 flex-1 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <div className="h-3 w-1/2 bg-slate-200 rounded-full mb-4"></div>
                    <div className="h-16 w-16 mx-auto rounded-full border-4 border-brand-500 border-t-slate-100"></div>
                  </div>
                </div>
              </div>
              
              <div className="h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <div className="h-2 w-16 bg-white/20 rounded-full"></div>
              </div>
            </div>

            {/* Decorative small cards */}
            <div className="absolute -left-12 top-1/4 h-24 w-48 bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-4 animate-bounce-slow">
              <div className="flex items-center space-x-3 mb-2">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                </div>
                <div className="h-3 w-20 bg-slate-200 rounded-full"></div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full mt-4"></div>
            </div>

            <div className="absolute -right-8 bottom-1/4 h-32 w-40 bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-4 animate-bounce-slow-delayed">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Brain className="h-4 w-4 text-blue-600" />
                </div>
                <div className="h-3 w-16 bg-slate-200 rounded-full"></div>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full bg-slate-100 rounded-full"></div>
                <div className="h-2 w-4/5 bg-slate-100 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Everything you need to run a modern pharmacy</h2>
            <p className="text-lg text-slate-600">Built from the ground up for speed, accuracy, and scale. MediFlow handles the complexity so you can focus on patient care.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="h-12 w-12 bg-brand-100 text-brand-600 rounded-2xl flex items-center justify-center mb-6">
                <Box className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Immutable Inventory</h3>
              <p className="text-slate-600 leading-relaxed">
                Track every pill with an append-only ledger. Batch-level precision, expiry tracking, and zero data corruption.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">AI Copilot</h3>
              <p className="text-slate-600 leading-relaxed">
                Query reports, check drug interactions, and automate purchase orders using natural language. Like having a genius assistant.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="h-12 w-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Multi-Store Tenancy</h3>
              <p className="text-slate-600 leading-relaxed">
                Manage multiple retail locations from one platform with strict row-level security and centralized accounting.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
