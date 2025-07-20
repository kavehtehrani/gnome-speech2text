// Basic GI type definitions to resolve module imports
declare module "gi://*" {
  const module: any;
  export = module;
}