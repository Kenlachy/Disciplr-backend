import { Request, Response, NextFunction } from 'express'

/**
 * Middleware that enforces Content-Type: application/json for requests with bodies.
 * 
 * This middleware:
 * - Allows GET, HEAD, OPTIONS requests to pass through (no body expected)
 * - Requires Content-Type: application/json for POST, PUT, PATCH, DELETE requests with bodies
 * - Returns 415 Unsupported Media Type for invalid content types
 * - Returns 400 Bad Request for malformed JSON (handled by express.json() middleware)
 * - Preserves the existing error envelope format used throughout the application
 * - Includes security enhancements to prevent bypass attempts
 */
export const requireJson = (req: Request, res: Response, next: NextFunction) => {
  const bodylessMethods = ['GET', 'HEAD', 'OPTIONS']
  
  if (bodylessMethods.includes(req.method)) {
    return next()
  }

  // Enhanced body detection - check multiple headers for robustness
  const contentLength = req.headers['content-length']
  const transferEncoding = req.headers['transfer-encoding']
  const hasBody = (contentLength && parseInt(contentLength, 10) > 0) || 
                   (transferEncoding && transferEncoding.toLowerCase() !== 'identity')

  if (!hasBody) {
    return next()
  }

  const contentType = req.headers['content-type']
  
  if (!contentType) {
    return res.status(415).json({
      error: 'Unsupported Media Type: Content-Type must be application/json'
    })
  }

  // Enhanced content-type validation with security checks
  const normalizedContentType = contentType.toLowerCase().trim()
  
  // Reject common bypass attempts
  const bypassPatterns = [
    'text/plain',
    'text/html', 
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data'
  ]
  
  if (bypassPatterns.some(pattern => normalizedContentType.includes(pattern))) {
    return res.status(415).json({
      error: 'Unsupported Media Type: Content-Type must be application/json'
    })
  }

  // Strict JSON content-type validation
  if (!normalizedContentType.includes('application/json')) {
    return res.status(415).json({
      error: 'Unsupported Media Type: Content-Type must be application/json'
    })
  }

  // Enhanced charset validation with security checks
  if (normalizedContentType.includes('charset')) {
    const charsetMatch = normalizedContentType.match(/charset=([^;]+)/i)
    if (charsetMatch) {
      const charset = charsetMatch[1].trim().toLowerCase()
      
      // Only allow UTF-8 for security
      if (charset !== 'utf-8') {
        return res.status(415).json({
          error: 'Unsupported Media Type: Only UTF-8 charset is supported for JSON'
        })
      }
      
      // Prevent charset declaration injection
      if (charset.length > 20) {
        return res.status(415).json({
          error: 'Unsupported Media Type: Invalid charset specification'
        })
      }
    }
  }

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  
  next()
}

/**
 * Enhanced middleware that enforces JSON content-type only for specific HTTP methods.
 * Includes additional security checks and logging.
 */
export const requireJsonForMethods = (methods: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method)) {
      return next()
    }
    
    // Log content-type enforcement attempts for security monitoring
    console.log(`Content-Type enforcement: ${req.method} ${req.path}`, {
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    })
    
    return requireJson(req, res, next)
  }
}

/**
 * Middleware that enforces JSON content-type only for specific HTTP methods.
 * This is useful when you want to enforce content-type for POST/PUT but not DELETE.
 */
export const requireJsonForMethods = (methods: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method)) {
      return next()
    }
    return requireJson(req, res, next)
  }
}
